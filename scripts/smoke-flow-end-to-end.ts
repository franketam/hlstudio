/**
 * Smoke end-to-end:
 *  1. Crea un turno via lógica replicada (idéntica a createTurno).
 *  2. Verifica que aparece en BD.
 *  3. Hace HTTP a /turno/[token] y comprueba 200 + contenido.
 *  4. Hace HTTP a /admin/agenda?fecha=... pero NO requiere auth en este script
 *     (lo lee directamente vía SQL para no batallar con la cookie).
 *  5. Limpia.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, gt, lt } from "drizzle-orm";
import { createHmac } from "node:crypto";
import * as schema from "@/db/schema";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
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

async function main() {
  const url = process.env.DATABASE_URL!;
  const secret = process.env.CANCEL_TOKEN_SECRET!;
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  const barberoId = "2732abf3-cb01-4f2d-a7e1-64e148e8f8a3"; // Hugo L.
  const servicioId = "27e28672-ee29-405b-b527-b82d36f5062f"; // Corte 30min

  // Mañana 11:00 ART = 14:00 UTC (mañana es 2026-05-07 jueves)
  const inicio = new Date("2026-05-07T14:00:00.000Z");
  const fin = new Date(inicio.getTime() + 30 * 60_000);

  // Limpiar resultados previos por si quedó algo de un run anterior
  await sql`delete from turnos where cliente_id in (select id from clientes where email='e2e@example.com')`;
  await sql`delete from clientes where email='e2e@example.com'`;

  const [c] = await db
    .insert(schema.clientes)
    .values({ nombre: "Cliente E2E", telefono: "+5491133224477", email: "e2e@example.com" })
    .returning({ id: schema.clientes.id });
  if (!c) throw new Error("cliente no creado");

  // Anti-doble-booking check (debe pasar — slot vacío)
  const conflictos = await db
    .select({ id: schema.turnos.id })
    .from(schema.turnos)
    .where(
      and(
        eq(schema.turnos.barberoId, barberoId),
        eq(schema.turnos.estado, "confirmado"),
        lt(schema.turnos.inicioTs, fin),
        gt(schema.turnos.finTs, inicio)
      )
    );
  if (conflictos.length > 0) throw new Error("conflicto inesperado");

  const [t] = await db
    .insert(schema.turnos)
    .values({
      clienteId: c.id,
      barberoId,
      servicioId,
      inicioTs: inicio,
      finTs: fin,
      estado: "confirmado",
      precioTotal: "16000.00",
      cancelToken: "pending",
    })
    .returning({ id: schema.turnos.id });
  if (!t) throw new Error("turno no creado");

  const token = buildToken(t.id, inicio.getTime(), secret);
  await db
    .update(schema.turnos)
    .set({ cancelToken: token })
    .where(eq(schema.turnos.id, t.id));

  console.log("[1] turno creado:", t.id);
  console.log("    token:", token);
  console.log("    URL:", `http://localhost:3000/turno/${encodeURIComponent(token)}`);

  // 2) HTTP /turno/[token]
  const url1 = `http://localhost:3000/turno/${encodeURIComponent(token)}`;
  const res1 = await fetch(url1);
  const html1 = await res1.text();
  console.log("[2] /turno/[token] status:", res1.status);
  console.log("    contiene Hugo:", html1.includes("Hugo"));
  console.log("    contiene Corte:", html1.includes("Corte"));
  console.log("    contiene Cancelar turno:", html1.includes("Cancelar turno"));

  // 3) /admin/agenda — sin auth retorna 307 a /admin/login. Lo dejamos como verificación de redirect.
  const res2 = await fetch(`http://localhost:3000/admin/agenda?fecha=2026-05-07`, {
    redirect: "manual",
  });
  console.log("[3] /admin/agenda sin auth → status:", res2.status, "(307 esperado)");

  // 4) Verificar que aparece en query directo (lo que admin/agenda hace internamente)
  const filas = await db
    .select({ id: schema.turnos.id, inicioTs: schema.turnos.inicioTs })
    .from(schema.turnos)
    .where(eq(schema.turnos.id, t.id));
  console.log("[4] verificación BD: filas encontradas:", filas.length);

  // limpieza
  await sql`delete from turnos where id=${t.id}`;
  await sql`delete from clientes where id=${c.id}`;
  await sql.end();
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
