/**
 * Seed inicial de HLstudio.
 *
 * Idempotente: corre N veces y no duplica.
 * - 2 barberos (Hugo L. — Leone / Leonel B. — Bagnasco)
 * - 3 servicios (Corte 30, Corte y barba 45, Barba 15)
 * - Precios iguales para los dos barberos (modelo permite diferenciar luego)
 * - Horarios martes a sábado: 10-13 y 15-20
 * - Días de descanso recurrentes: domingo (0) y lunes (1)
 *
 * Uso: `npm run db:seed`
 */
import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// Cargar .env.local manualmente (corre fuera de Next).
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

type SeedBarbero = {
  nombre: string;
  orden: number;
  email?: string;
  descripcion?: string;
};

type SeedServicio = {
  nombre: string;
  duracionMin: number;
  precio: string; // numeric en BD se serializa como string
  orden: number;
};

// TODO: reemplazar con los emails reales de cada barbero una vez confirmados.
// Si se deja vacío, no se envía notificación al barbero al crear turno.
const BARBEROS: SeedBarbero[] = [
  { nombre: "Hugo L.", orden: 1, email: "" },
  { nombre: "Leonel B.", orden: 2, email: "" },
];

const SERVICIOS: SeedServicio[] = [
  { nombre: "Corte", duracionMin: 30, precio: "16000.00", orden: 1 },
  { nombre: "Corte y barba", duracionMin: 45, precio: "18000.00", orden: 2 },
  { nombre: "Barba", duracionMin: 15, precio: "7000.00", orden: 3 },
];

// Horarios de operación: martes (2) a sábado (6), dos rangos.
// Domingo (0) y lunes (1) quedan cerrados (sin filas y además marcados en dias_descanso_recurrente).
const DIAS_LABORALES = [2, 3, 4, 5, 6];
const RANGOS = [
  { apertura: "10:00:00", cierre: "13:00:00" },
  { apertura: "15:00:00", cierre: "20:00:00" },
];

const DIAS_DESCANSO = [
  { diaSemana: 0, motivo: "Domingo" },
  { diaSemana: 1, motivo: "Lunes" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está seteada.");
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log("[seed] iniciando...");

  // ---------- Barberos ----------
  for (const b of BARBEROS) {
    const existing = await db
      .select({ id: schema.barberos.id })
      .from(schema.barberos)
      .where(eq(schema.barberos.nombre, b.nombre))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.barberos).values({
        nombre: b.nombre,
        orden: b.orden,
        activo: true,
        email: b.email && b.email.length > 0 ? b.email : null,
      });
      console.log(`[seed] barbero creado: ${b.nombre}`);
    } else if (b.email && b.email.length > 0) {
      // Si el barbero ya existe pero el seed trae un email, lo refrescamos
      // (permite cargar emails post-creación re-corriendo el seed).
      await db
        .update(schema.barberos)
        .set({ email: b.email, updatedAt: new Date() })
        .where(eq(schema.barberos.nombre, b.nombre));
      console.log(`[seed] barbero email actualizado: ${b.nombre}`);
    } else {
      console.log(`[seed] barbero ya existe: ${b.nombre}`);
    }
  }

  // ---------- Servicios ----------
  for (const s of SERVICIOS) {
    const existing = await db
      .select({ id: schema.servicios.id })
      .from(schema.servicios)
      .where(eq(schema.servicios.nombre, s.nombre))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.servicios).values({
        nombre: s.nombre,
        duracionMin: s.duracionMin,
        orden: s.orden,
        activo: true,
      });
      console.log(`[seed] servicio creado: ${s.nombre}`);
    } else {
      console.log(`[seed] servicio ya existe: ${s.nombre}`);
    }
  }

  // ---------- Precios (cartesiano barbero x servicio, todos al mismo precio) ----------
  const allBarberos = await db
    .select({ id: schema.barberos.id, nombre: schema.barberos.nombre })
    .from(schema.barberos);
  const allServicios = await db
    .select({
      id: schema.servicios.id,
      nombre: schema.servicios.nombre,
    })
    .from(schema.servicios);

  for (const barbero of allBarberos) {
    for (const servicio of allServicios) {
      const seed = SERVICIOS.find((s) => s.nombre === servicio.nombre);
      if (!seed) continue;

      const existing = await db
        .select({ barberoId: schema.preciosBarberoServicio.barberoId })
        .from(schema.preciosBarberoServicio)
        .where(
          and(
            eq(schema.preciosBarberoServicio.barberoId, barbero.id),
            eq(schema.preciosBarberoServicio.servicioId, servicio.id)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(schema.preciosBarberoServicio).values({
          barberoId: barbero.id,
          servicioId: servicio.id,
          precio: seed.precio,
        });
        console.log(
          `[seed] precio creado: ${barbero.nombre} x ${servicio.nombre} = $${seed.precio}`
        );
      }
    }
  }

  // ---------- Horarios de operación ----------
  // Estrategia idempotente: si para (dia, apertura, cierre) ya hay fila, no inserto.
  for (const dia of DIAS_LABORALES) {
    for (const r of RANGOS) {
      const existing = await db
        .select({ id: schema.horariosOperacion.id })
        .from(schema.horariosOperacion)
        .where(
          and(
            eq(schema.horariosOperacion.diaSemana, dia),
            eq(schema.horariosOperacion.apertura, r.apertura),
            eq(schema.horariosOperacion.cierre, r.cierre)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(schema.horariosOperacion).values({
          diaSemana: dia,
          apertura: r.apertura,
          cierre: r.cierre,
          activo: true,
        });
        console.log(
          `[seed] horario creado: dia=${dia} ${r.apertura}-${r.cierre}`
        );
      }
    }
  }

  // ---------- Días de descanso recurrentes ----------
  for (const d of DIAS_DESCANSO) {
    const existing = await db
      .select({ diaSemana: schema.diasDescansoRecurrente.diaSemana })
      .from(schema.diasDescansoRecurrente)
      .where(eq(schema.diasDescansoRecurrente.diaSemana, d.diaSemana))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.diasDescansoRecurrente).values({
        diaSemana: d.diaSemana,
        motivo: d.motivo,
      });
      console.log(`[seed] descanso recurrente creado: ${d.motivo}`);
    }
  }

  console.log("[seed] OK");
  await sql.end();
}

main().catch((err) => {
  console.error("[seed] FAILED", err);
  process.exit(1);
});
