/**
 * Helper local para smoke tests: listar IDs reales en la BD para construir URLs
 * de prueba del flujo de reserva.
 *
 * Uso: `npx tsx scripts/smoke-list-ids.ts`
 */
import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL falta");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  const barberos = await db.select().from(schema.barberos);
  const servicios = await db.select().from(schema.servicios);
  const turnos = await db.select().from(schema.turnos).limit(5);

  console.log("BARBEROS:");
  for (const b of barberos) console.log(`  ${b.id}  ${b.nombre}`);
  console.log("SERVICIOS:");
  for (const s of servicios) console.log(`  ${s.id}  ${s.nombre} (${s.duracionMin}min)`);
  console.log("TURNOS (5):");
  for (const t of turnos)
    console.log(
      `  ${t.id}  ${t.estado}  ${t.inicioTs.toISOString()}  cancel=${t.cancelToken.slice(0, 24)}...`
    );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
