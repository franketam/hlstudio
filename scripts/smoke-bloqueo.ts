/**
 * Smoke local: verificar que un bloqueo puntual oculta slots de un barbero
 * sin afectar a los otros.
 *
 * Llama a /reservar/dia via HTTP y parsea el HTML buscando los labels HH:mm
 * dentro de la grilla de slots.
 *
 * Uso: `npx tsx scripts/smoke-bloqueo.ts [base-url]`
 *   por default http://localhost:3010
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

/** Extrae HH:mm de la grilla de slots de /reservar/dia */
function extractSlotsFromHtml(html: string): string[] {
  // Cada slot se renderiza como <a class="numeral flex ...">HH:mm</a>
  const out = new Set<string>();
  const re = />(\d{2}:\d{2})</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out).sort();
}

async function fetchSlots(
  barberoId: string,
  servicioId: string,
  fecha: string
): Promise<string[]> {
  const url = `${BASE}/reservar/dia?barbero=${barberoId}&servicio=${servicioId}&fecha=${fecha}`;
  const res = await fetch(url, {
    headers: { "user-agent": "hlstudio-smoke-bloqueo/1.0" },
  });
  if (res.status !== 200) {
    throw new Error(`/reservar/dia devolvió ${res.status} para ${barberoId}`);
  }
  const html = await res.text();
  return extractSlotsFromHtml(html);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL falta");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  // 1. Próximo martes (laboral).
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
  console.log(`[smoke-bloqueo] base=${BASE} fecha=${fecha}`);

  // 2. Barberos activos.
  const barberosActivos = await db
    .select()
    .from(schema.barberos)
    .where(eq(schema.barberos.activo, true))
    .orderBy(asc(schema.barberos.orden));

  if (barberosActivos.length < 2) {
    throw new Error("Necesito >= 2 barberos activos");
  }
  const [b1, b2] = barberosActivos;
  if (!b1 || !b2) throw new Error("barberos undefined");

  // 3. Servicio activo con precio definido para b1 y b2 (corte 30min normalmente).
  const serviciosActivos = await db
    .select()
    .from(schema.servicios)
    .where(eq(schema.servicios.activo, true))
    .orderBy(asc(schema.servicios.orden));

  let servicio: schema.Servicio | null = null;
  for (const s of serviciosActivos) {
    const [precioB1] = await db
      .select()
      .from(schema.preciosBarberoServicio)
      .where(
        and(
          eq(schema.preciosBarberoServicio.barberoId, b1.id),
          eq(schema.preciosBarberoServicio.servicioId, s.id)
        )
      )
      .limit(1);
    const [precioB2] = await db
      .select()
      .from(schema.preciosBarberoServicio)
      .where(
        and(
          eq(schema.preciosBarberoServicio.barberoId, b2.id),
          eq(schema.preciosBarberoServicio.servicioId, s.id)
        )
      )
      .limit(1);
    if (precioB1 && precioB2) {
      servicio = s;
      break;
    }
  }
  if (!servicio) {
    throw new Error("no encontré un servicio con precio en ambos barberos");
  }

  console.log(
    `[smoke-bloqueo] bloqueado=${b1.nombre} control=${b2.nombre} servicio=${servicio.nombre} dur=${servicio.duracionMin}min`
  );

  // 4. Slots SIN bloqueo — baseline.
  const baselineB1 = await fetchSlots(b1.id, servicio.id, fecha);
  const baselineB2 = await fetchSlots(b2.id, servicio.id, fecha);
  console.log(
    `[smoke-bloqueo] baseline ${b1.nombre}: ${baselineB1.length} slots → ${baselineB1.join(", ")}`
  );
  console.log(
    `[smoke-bloqueo] baseline ${b2.nombre}: ${baselineB2.length} slots → ${baselineB2.join(", ")}`
  );

  if (!baselineB1.includes("10:00")) {
    console.warn(
      `WARN: 10:00 no está en baseline de ${b1.nombre} — quizás horario no cubre 10:00 o ya está reservado. Test no aplicable. Saliendo.`
    );
    await sql.end();
    return;
  }

  // 5. Crear bloqueo 10:00–13:00 ART del día target para b1.
  const desdeTs = fromZonedTime(`${fecha}T10:00:00`, TZ);
  const hastaTs = fromZonedTime(`${fecha}T13:00:00`, TZ);
  const [bloqueo] = await db
    .insert(schema.bloqueosAgenda)
    .values({
      barberoId: b1.id,
      desdeTs,
      hastaTs,
      motivo: "smoke-test",
    })
    .returning();
  if (!bloqueo) throw new Error("no se pudo crear bloqueo");
  console.log(`[smoke-bloqueo] bloqueo creado id=${bloqueo.id}`);

  let passed = true;
  try {
    const conBloqueoB1 = await fetchSlots(b1.id, servicio.id, fecha);
    const conBloqueoB2 = await fetchSlots(b2.id, servicio.id, fecha);
    console.log(
      `[smoke-bloqueo] con-bloqueo ${b1.nombre}: ${conBloqueoB1.length} slots → ${conBloqueoB1.join(", ")}`
    );
    console.log(
      `[smoke-bloqueo] con-bloqueo ${b2.nombre}: ${conBloqueoB2.length} slots → ${conBloqueoB2.join(", ")}`
    );

    // Esperamos que 10:00..12:30 (HH:mm de inicio para duración 30 que terminen <=13:00)
    // NO aparezcan en b1.
    const enRangoBloqueado = (h: string) => {
      const [hhStr, mmStr] = h.split(":");
      const hh = Number(hhStr ?? "0");
      const mm = Number(mmStr ?? "0");
      const min = hh * 60 + mm;
      return min >= 10 * 60 && min < 13 * 60;
    };

    const leakB1 = conBloqueoB1.filter(enRangoBloqueado);
    if (leakB1.length > 0) {
      console.error(
        `  FAIL: ${b1.nombre} muestra slots en el rango bloqueado: ${leakB1.join(", ")}`
      );
      passed = false;
    } else {
      console.log(
        `  OK: ${b1.nombre} no muestra ningún slot 10:00..12:59 (rango bloqueado).`
      );
    }

    // b2 (no bloqueado) debe seguir con los slots que tenía en baseline.
    const diffB2 = baselineB2.filter((s) => !conBloqueoB2.includes(s));
    if (diffB2.length > 0) {
      console.error(
        `  FAIL: ${b2.nombre} perdió slots: ${diffB2.join(", ")}`
      );
      passed = false;
    } else {
      console.log(`  OK: ${b2.nombre} mantiene todos sus slots`);
    }
  } finally {
    await db
      .delete(schema.bloqueosAgenda)
      .where(eq(schema.bloqueosAgenda.id, bloqueo.id));
    console.log(`[smoke-bloqueo] cleanup OK`);
  }

  await sql.end();
  if (!passed) {
    console.log("\n[smoke-bloqueo] FAILED");
    process.exit(1);
  }
  console.log("\n[smoke-bloqueo] PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
