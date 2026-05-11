/**
 * Smoke local: verificar que un bloqueo GLOBAL (barbero_id = null) que cubre
 * todo el día cierra el día (isDiaAbierto false → UI muestra "Cerrado").
 *
 * Uso: `npx tsx scripts/smoke-bloqueo-global.ts [base-url]`
 */
import * as fs from "node:fs";
import * as path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { eq, asc, and } from "drizzle-orm";
import * as schema from "@/db/schema";

const TZ = "America/Argentina/Buenos_Aires";
const BASE = (process.argv[2] || "http://localhost:3010").replace(/\/$/, "");

function ymd(d: Date): string {
  const local = toZonedTime(d, TZ);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchPage(
  barberoId: string,
  servicioId: string,
  fecha: string
): Promise<string> {
  const url = `${BASE}/reservar/dia?barbero=${barberoId}&servicio=${servicioId}&fecha=${fecha}`;
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`/reservar/dia ${res.status}`);
  return res.text();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL falta");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  // Próximo martes.
  const hoyLocal = toZonedTime(new Date(), TZ);
  let target: Date | null = null;
  for (let i = 1; i <= 8; i++) {
    const d = addDays(hoyLocal, i);
    if (d.getDay() === 2) {
      target = d;
      break;
    }
  }
  if (!target) throw new Error("no encontré próximo martes");
  const fecha = ymd(target);

  const [b1] = await db
    .select()
    .from(schema.barberos)
    .where(eq(schema.barberos.activo, true))
    .orderBy(asc(schema.barberos.orden))
    .limit(1);
  if (!b1) throw new Error("sin barberos");

  const serviciosActivos = await db
    .select()
    .from(schema.servicios)
    .where(eq(schema.servicios.activo, true))
    .orderBy(asc(schema.servicios.orden));

  let servicio: schema.Servicio | null = null;
  for (const s of serviciosActivos) {
    const [precio] = await db
      .select()
      .from(schema.preciosBarberoServicio)
      .where(
        and(
          eq(schema.preciosBarberoServicio.barberoId, b1.id),
          eq(schema.preciosBarberoServicio.servicioId, s.id)
        )
      )
      .limit(1);
    if (precio) {
      servicio = s;
      break;
    }
  }
  if (!servicio) throw new Error("sin servicio con precio");

  console.log(`[bloqueo-global] base=${BASE} fecha=${fecha} barbero=${b1.nombre}`);

  // Baseline.
  const baseline = await fetchPage(b1.id, servicio.id, fecha);
  const baselineCerrado = /Cerrado este día/.test(baseline);
  console.log(`[bloqueo-global] baseline ¿cerrado? = ${baselineCerrado}`);
  if (baselineCerrado) {
    console.warn("WARN: el día ya está cerrado en baseline, test no aplicable.");
    await sql.end();
    return;
  }

  // Crear bloqueo GLOBAL que cubre el día completo (00:00 → +1d 00:00 ART).
  const desdeTs = fromZonedTime(`${fecha}T00:00:00`, TZ);
  const hastaYmd = (() => {
    const [yStr, mStr, dStr] = fecha.split("-");
    const d = new Date(Number(yStr), Number(mStr) - 1, Number(dStr));
    const next = addDays(d, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  })();
  const hastaTs = fromZonedTime(`${hastaYmd}T00:00:00`, TZ);

  const [bloqueo] = await db
    .insert(schema.bloqueosAgenda)
    .values({
      barberoId: null,
      desdeTs,
      hastaTs,
      motivo: "smoke-global",
    })
    .returning();
  if (!bloqueo) throw new Error("no se pudo crear bloqueo");
  console.log(`[bloqueo-global] bloqueo global creado id=${bloqueo.id}`);

  let passed = true;
  try {
    const conBloqueo = await fetchPage(b1.id, servicio.id, fecha);
    const cerrado = /Cerrado este día/.test(conBloqueo);
    console.log(`[bloqueo-global] con-bloqueo ¿cerrado? = ${cerrado}`);
    if (!cerrado) {
      console.error("FAIL: esperaba 'Cerrado este día' tras bloqueo global, no apareció.");
      passed = false;
    } else {
      console.log("  OK: día cerrado tras bloqueo global");
    }
  } finally {
    await db
      .delete(schema.bloqueosAgenda)
      .where(eq(schema.bloqueosAgenda.id, bloqueo.id));
    console.log(`[bloqueo-global] cleanup OK`);
  }

  await sql.end();
  if (!passed) process.exit(1);
  console.log("\n[bloqueo-global] PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
