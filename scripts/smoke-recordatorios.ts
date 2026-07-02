/**
 * Smoke test del flow de recordatorios.
 *
 * Crea un turno con inicio_ts ~24h en el futuro y otro ~2h30 (dentro de la
 * ventana del T-3h), corre el barrido en --dry-run, valida que ambos sean
 * detectados, y limpia.
 *
 * Uso: `npx tsx scripts/smoke-recordatorios.ts`
 */
import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  findCandidatos,
  procesarCandidato,
} from "@/server/email/send-recordatorio";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL falta");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  // Tomar el primer barbero y servicio activos.
  const [barbero] = await db
    .select()
    .from(schema.barberos)
    .where(eq(schema.barberos.activo, true))
    .limit(1);
  const [servicio] = await db
    .select()
    .from(schema.servicios)
    .where(eq(schema.servicios.activo, true))
    .limit(1);

  if (!barbero || !servicio) {
    console.error("falta seed: corré npm run db:seed");
    process.exit(1);
  }

  const [precio] = await db
    .select()
    .from(schema.preciosBarberoServicio)
    .where(
      and(
        eq(schema.preciosBarberoServicio.barberoId, barbero.id),
        eq(schema.preciosBarberoServicio.servicioId, servicio.id)
      )
    )
    .limit(1);

  if (!precio) {
    console.error("falta precio para el par barbero/servicio");
    process.exit(1);
  }

  // Cliente de prueba.
  const tel = "+5491100000077";
  const emailCliente = "smoke-recordatorios@example.com";
  let [cliente] = await db
    .select()
    .from(schema.clientes)
    .where(eq(schema.clientes.telefono, tel))
    .limit(1);
  if (!cliente) {
    const inserted = await db
      .insert(schema.clientes)
      .values({
        nombre: "Smoke Recordatorios",
        telefono: tel,
        email: emailCliente,
      })
      .returning();
    cliente = inserted[0];
    if (!cliente) throw new Error("no se pudo crear cliente smoke");
  } else if (cliente.email !== emailCliente) {
    await db
      .update(schema.clientes)
      .set({ email: emailCliente })
      .where(eq(schema.clientes.id, cliente.id));
  }

  // Limpiar turnos previos del cliente smoke.
  await db.delete(schema.turnos).where(eq(schema.turnos.clienteId, cliente.id));

  const now = new Date();
  const inicio24h = new Date(now.getTime() + 24 * 3_600_000); // exact T-24h
  const fin24h = new Date(
    inicio24h.getTime() + servicio.duracionMin * 60_000
  );
  // Dentro de la ventana del T-3h (now+1h..now+3h), lejos de los bordes.
  const inicio3h = new Date(now.getTime() + 2.5 * 3_600_000);
  const fin3h = new Date(inicio3h.getTime() + servicio.duracionMin * 60_000);

  await db.insert(schema.turnos).values([
    {
      clienteId: cliente.id,
      barberoId: barbero.id,
      servicioId: servicio.id,
      inicioTs: inicio24h,
      finTs: fin24h,
      estado: "confirmado",
      precioTotal: precio.precio,
      cancelToken: `smoke-24h-${Date.now()}`,
    },
    {
      clienteId: cliente.id,
      barberoId: barbero.id,
      servicioId: servicio.id,
      inicioTs: inicio3h,
      finTs: fin3h,
      estado: "confirmado",
      precioTotal: precio.precio,
      cancelToken: `smoke-3h-${Date.now()}`,
    },
  ]);

  console.log(
    `\n[smoke] insertados 2 turnos para ${cliente.nombre} (id=${cliente.id})`
  );

  // 1) Búsqueda T-24h
  const cand24h = await findCandidatos(db, "24h", now);
  console.log(`\n[smoke] candidatos T-24h: ${cand24h.length}`);
  const t24h = cand24h.find((c) => c.clienteEmail === emailCliente);
  if (!t24h) {
    console.error("FAIL: no se detectó el turno T-24h");
    process.exitCode = 1;
  } else {
    console.log(`  OK: turnoId=${t24h.turnoId} inicio=${t24h.inicio.toISOString()}`);
  }

  // 2) Búsqueda T-3h
  const cand3h = await findCandidatos(db, "3h", now);
  console.log(`\n[smoke] candidatos T-3h: ${cand3h.length}`);
  const t3h = cand3h.find((c) => c.clienteEmail === emailCliente);
  if (!t3h) {
    console.error("FAIL: no se detectó el turno T-3h");
    process.exitCode = 1;
  } else {
    console.log(`  OK: turnoId=${t3h.turnoId} inicio=${t3h.inicio.toISOString()}`);
  }

  // 3) Dry-run procesarCandidato: NO debe crear lock ni mandar nada
  if (t24h) {
    const res = await procesarCandidato(db, t24h, "24h", {
      dryRun: true,
      appUrl: "http://localhost:3000",
    });
    console.log(`\n[smoke] dry-run procesarCandidato(24h):`, res);
    const locks = await db
      .select()
      .from(schema.notificacionesEnviadas)
      .where(
        and(
          eq(schema.notificacionesEnviadas.turnoId, t24h.turnoId),
          eq(schema.notificacionesEnviadas.tipo, "recordatorio_24h")
        )
      );
    if (locks.length !== 0) {
      console.error(`FAIL: dry-run dejó lock en BD (${locks.length} filas)`);
      process.exitCode = 1;
    } else {
      console.log("  OK: dry-run no creó lock");
    }
  }

  // 4) Test: turno pasado NO se detecta
  await db
    .update(schema.turnos)
    .set({
      inicioTs: new Date(now.getTime() - 3_600_000),
      finTs: new Date(now.getTime() - 3_600_000 + servicio.duracionMin * 60_000),
    })
    .where(
      and(
        eq(schema.turnos.clienteId, cliente.id),
        eq(schema.turnos.cancelToken, t24h?.cancelToken ?? "")
      )
    );
  const candPostPasado = await findCandidatos(db, "24h", now);
  const sigueAhi = candPostPasado.find((c) => c.clienteEmail === emailCliente);
  // El otro turno (T-3h) sigue, pero el ex T-24h ya está en el pasado y no debe
  // aparecer (la ventana es +22h..+24h).
  if (sigueAhi && sigueAhi.turnoId === t24h?.turnoId) {
    console.error(
      "FAIL: turno con inicio_ts en el pasado seguía siendo candidato T-24h"
    );
    process.exitCode = 1;
  } else {
    console.log(
      "\n[smoke] OK: turno con inicio_ts en el pasado no es candidato T-24h"
    );
  }

  // Limpieza
  console.log("\n[smoke] limpieza...");
  await db.delete(schema.turnos).where(eq(schema.turnos.clienteId, cliente.id));
  await db.delete(schema.clientes).where(eq(schema.clientes.id, cliente.id));

  await sql.end();
  console.log(
    process.exitCode === 1 ? "\n[smoke] FAIL\n" : "\n[smoke] OK\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
