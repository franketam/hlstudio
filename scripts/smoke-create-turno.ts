/**
 * Smoke test: replica la lógica de createTurno + cancelTurno fuera de Next.
 *
 * No importa los modules con `server-only` (eso solo corre dentro de Next).
 * En su lugar conecta directo y reproduce las queries/validaciones clave.
 *
 * Uso: `npx tsx scripts/smoke-create-turno.ts`
 */
import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, gt, lt } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createHmac } from "node:crypto";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

function rangesOverlap(aIni: Date, aFin: Date, bIni: Date, bFin: Date) {
  return aIni < bFin && bIni < aFin;
}

function buildToken(turnoId: string, inicioMs: number, secret: string) {
  const payload = `${turnoId}|${inicioMs}`;
  const mac = createHmac("sha256", secret).update(payload).digest();
  const sig = mac
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${turnoId}.${inicioMs}.${sig}`;
}

async function tryCreateTurno(opts: {
  db: ReturnType<typeof drizzle<typeof schema>>;
  barberoId: string;
  servicioId: string;
  inicio: Date;
  cliente: { nombre: string; telefono: string; email: string };
  secret: string;
}): Promise<{ ok: true; turnoId: string; token: string } | { ok: false; code: string }> {
  const { db, barberoId, servicioId, inicio, cliente, secret } = opts;

  const [s] = await db
    .select({ duracionMin: schema.servicios.duracionMin })
    .from(schema.servicios)
    .where(eq(schema.servicios.id, servicioId))
    .limit(1);
  if (!s) return { ok: false, code: "servicio_no_encontrado" };

  const fin = new Date(inicio.getTime() + s.duracionMin * 60_000);

  const [precioRow] = await db
    .select({ precio: schema.preciosBarberoServicio.precio })
    .from(schema.preciosBarberoServicio)
    .where(
      and(
        eq(schema.preciosBarberoServicio.barberoId, barberoId),
        eq(schema.preciosBarberoServicio.servicioId, servicioId)
      )
    )
    .limit(1);
  if (!precioRow) return { ok: false, code: "precio_no_definido" };

  // upsert cliente by phone
  const tel = cliente.telefono;
  let clienteId: string;
  const [existing] = await db
    .select({ id: schema.clientes.id })
    .from(schema.clientes)
    .where(eq(schema.clientes.telefono, tel))
    .limit(1);
  if (existing) {
    clienteId = existing.id;
  } else {
    const [c] = await db
      .insert(schema.clientes)
      .values({ nombre: cliente.nombre, telefono: tel, email: cliente.email })
      .returning({ id: schema.clientes.id });
    if (!c) return { ok: false, code: "cliente_no_creado" };
    clienteId = c.id;
  }

  let turnoId: string | null = null;
  let conflicto = false;

  try {
    await db.transaction(
      async (tx) => {
        const conflictos = await tx
          .select({ inicioTs: schema.turnos.inicioTs, finTs: schema.turnos.finTs })
          .from(schema.turnos)
          .where(
            and(
              eq(schema.turnos.barberoId, barberoId),
              eq(schema.turnos.estado, "confirmado"),
              lt(schema.turnos.inicioTs, fin),
              gt(schema.turnos.finTs, inicio)
            )
          );

        const haySolape = conflictos.some((c) =>
          rangesOverlap(inicio, fin, c.inicioTs, c.finTs)
        );
        if (haySolape) {
          conflicto = true;
          throw new Error("__SLOT_OCUPADO__");
        }

        const [row] = await tx
          .insert(schema.turnos)
          .values({
            clienteId,
            barberoId,
            servicioId,
            inicioTs: inicio,
            finTs: fin,
            estado: "confirmado",
            precioTotal: precioRow.precio,
            cancelToken: "pending",
          })
          .returning({ id: schema.turnos.id });
        if (!row) throw new Error("insert 0 rows");
        const token = buildToken(row.id, inicio.getTime(), secret);
        await tx
          .update(schema.turnos)
          .set({ cancelToken: token })
          .where(eq(schema.turnos.id, row.id));
        turnoId = row.id;
      },
      { isolationLevel: "serializable" }
    );
  } catch (err) {
    if (conflicto) return { ok: false, code: "slot_ocupado" };
    console.error("tx error:", err);
    return { ok: false, code: "internal_error" };
  }

  if (!turnoId) return { ok: false, code: "internal_error" };
  const token = buildToken(turnoId, inicio.getTime(), secret);
  return { ok: true, turnoId, token };
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const secret = process.env.CANCEL_TOKEN_SECRET!;
  if (!url || !secret) throw new Error("env faltante");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  const barberoId = "2732abf3-cb01-4f2d-a7e1-64e148e8f8a3";
  const servicioId = "27e28672-ee29-405b-b527-b82d36f5062f";

  // 2026-05-08 11:30 ART = 14:30 UTC
  const inicio = new Date("2026-05-08T14:30:00.000Z");

  console.log("--- 1) Reserva en slot vacío");
  const r1 = await tryCreateTurno({
    db,
    barberoId,
    servicioId,
    inicio,
    cliente: { nombre: "Test Smoke", telefono: "+5491155551234", email: "smoke@example.com" },
    secret,
  });
  console.log(r1);

  console.log("--- 2) Otra persona al MISMO slot (debe fallar con slot_ocupado)");
  const r2 = await tryCreateTurno({
    db,
    barberoId,
    servicioId,
    inicio,
    cliente: { nombre: "Otra", telefono: "+5491199998888", email: "otra@example.com" },
    secret,
  });
  console.log(r2);

  console.log("--- 3) Slot que se solapa parcialmente (10 min después, debe fallar)");
  const r3 = await tryCreateTurno({
    db,
    barberoId,
    servicioId,
    inicio: new Date(inicio.getTime() + 10 * 60_000),
    cliente: { nombre: "Otra2", telefono: "+5491177776666", email: "otra2@example.com" },
    secret,
  });
  console.log(r3);

  console.log("--- 4) Slot adyacente sin solapar (30 min después, debe pasar)");
  const r4 = await tryCreateTurno({
    db,
    barberoId,
    servicioId,
    inicio: new Date(inicio.getTime() + 30 * 60_000),
    cliente: { nombre: "Otra3", telefono: "+5491166665555", email: "otra3@example.com" },
    secret,
  });
  console.log(r4);

  // limpiar smoke turnos
  console.log("--- limpieza");
  await sql`delete from turnos where cliente_id in (select id from clientes where email like '%@example.com')`;
  await sql`delete from clientes where email like '%@example.com'`;
  await sql.end();
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
