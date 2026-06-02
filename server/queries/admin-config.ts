import "server-only";

import { asc, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  barberos,
  bloqueosAgenda,
  bloqueosRecurrentes,
  diasDescansoRecurrente,
  horariosOperacion,
  preciosBarberoServicio,
  servicios,
} from "@/db/schema";
import type { Barbero, Servicio } from "@/db/schema";

/**
 * Listados completos (activos + inactivos) para el panel.
 * El listado público vive en `server/queries/public.ts` y filtra por activo.
 */

export async function listServiciosAdmin(): Promise<Servicio[]> {
  return db
    .select()
    .from(servicios)
    .orderBy(asc(servicios.orden), asc(servicios.nombre));
}

export async function getServicioByIdAdmin(
  id: string
): Promise<Servicio | null> {
  const [row] = await db
    .select()
    .from(servicios)
    .where(eq(servicios.id, id))
    .limit(1);
  return row ?? null;
}

export async function listBarberosAdmin(): Promise<Barbero[]> {
  return db
    .select()
    .from(barberos)
    .orderBy(asc(barberos.orden), asc(barberos.nombre));
}

export async function getBarberoByIdAdmin(
  id: string
): Promise<Barbero | null> {
  const [row] = await db
    .select()
    .from(barberos)
    .where(eq(barberos.id, id))
    .limit(1);
  return row ?? null;
}

export type MatrizPreciosData = {
  barberos: Array<{ id: string; nombre: string; orden: number }>;
  servicios: Array<{
    id: string;
    nombre: string;
    duracionMin: number;
    orden: number;
  }>;
  /**
   * Mapa "barberoId__servicioId" → precio (string numérico tal como vuelve de pg).
   * Solo incluye filas existentes en BD. Las combinaciones ausentes representan
   * "este barbero no ofrece este servicio".
   */
  precios: Record<string, string>;
};

/**
 * Devuelve barberos activos, servicios activos y todos los precios cargados
 * que correspondan a esos pares activos. Diseñado para la matriz del admin.
 */
export async function getMatrizPrecios(): Promise<MatrizPreciosData> {
  const [barberosRows, serviciosRows, preciosRows] = await Promise.all([
    db
      .select({
        id: barberos.id,
        nombre: barberos.nombre,
        orden: barberos.orden,
      })
      .from(barberos)
      .where(eq(barberos.activo, true))
      .orderBy(asc(barberos.orden), asc(barberos.nombre)),
    db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        duracionMin: servicios.duracionMin,
        orden: servicios.orden,
      })
      .from(servicios)
      .where(eq(servicios.activo, true))
      .orderBy(asc(servicios.orden), asc(servicios.nombre)),
    db
      .select({
        barberoId: preciosBarberoServicio.barberoId,
        servicioId: preciosBarberoServicio.servicioId,
        precio: preciosBarberoServicio.precio,
      })
      .from(preciosBarberoServicio),
  ]);

  const barberoIds = new Set(barberosRows.map((b) => b.id));
  const servicioIds = new Set(serviciosRows.map((s) => s.id));

  const precios: Record<string, string> = {};
  for (const p of preciosRows) {
    // Filtramos a pares (barbero activo × servicio activo). Filas para entidades
    // inactivas siguen viviendo en BD y se restauran si el admin reactiva.
    if (barberoIds.has(p.barberoId) && servicioIds.has(p.servicioId)) {
      precios[`${p.barberoId}__${p.servicioId}`] = p.precio;
    }
  }

  return {
    barberos: barberosRows,
    servicios: serviciosRows,
    precios,
  };
}

export type RangoHorario = {
  /** "HH:MM" — sin segundos. */
  apertura: string;
  /** "HH:MM" — sin segundos. */
  cierre: string;
};

export type HorariosConfigData = {
  /**
   * Para cada día de semana (0..6), si está abierto y qué rangos tiene.
   * Un día "abierto" tiene al menos un rango. Un día sin rangos y sin entry
   * en diasDescansoRecurrente se considera cerrado por omisión (no debería pasar,
   * pero el editor lo normaliza al guardar).
   */
  dias: Record<
    number,
    {
      abierto: boolean;
      rangos: RangoHorario[];
    }
  >;
};

/**
 * Truncamos "HH:MM:SS" → "HH:MM" para el editor. La capa de persistencia vuelve
 * a agregar ":00" antes de insertar, para mantener consistencia con el seed
 * ("10:00:00") y simplificar diffs.
 */
function trimSeconds(hhmmss: string): string {
  const parts = hhmmss.split(":");
  const hh = (parts[0] ?? "00").padStart(2, "0");
  const mm = (parts[1] ?? "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function getHorariosConfig(): Promise<HorariosConfigData> {
  const [rangosRows, descansosRows] = await Promise.all([
    db
      .select({
        diaSemana: horariosOperacion.diaSemana,
        apertura: horariosOperacion.apertura,
        cierre: horariosOperacion.cierre,
      })
      .from(horariosOperacion)
      .where(eq(horariosOperacion.activo, true))
      .orderBy(asc(horariosOperacion.diaSemana), asc(horariosOperacion.apertura)),
    db
      .select({ diaSemana: diasDescansoRecurrente.diaSemana })
      .from(diasDescansoRecurrente),
  ]);

  const descansoSet = new Set(descansosRows.map((d) => d.diaSemana));
  const rangosPorDia = new Map<number, RangoHorario[]>();
  for (const r of rangosRows) {
    const list = rangosPorDia.get(r.diaSemana) ?? [];
    list.push({
      apertura: trimSeconds(r.apertura),
      cierre: trimSeconds(r.cierre),
    });
    rangosPorDia.set(r.diaSemana, list);
  }

  const dias: HorariosConfigData["dias"] = {};
  for (let d = 0; d <= 6; d++) {
    const rangos = rangosPorDia.get(d) ?? [];
    // "Abierto" = no está en la tabla de descanso recurrente. Los rangos pueden
    // estar vacíos en el caso degenerado (el editor obliga >= 1 al guardar).
    const abierto = !descansoSet.has(d) && rangos.length > 0;
    dias[d] = { abierto, rangos };
  }

  return { dias };
}

export type BloqueoVigente = {
  id: string;
  barberoId: string | null;
  barberoNombre: string | null;
  desdeTs: Date;
  hastaTs: Date;
  motivo: string | null;
};

/**
 * Bloqueos cuyo `hasta_ts` es futuro respecto de "ahora" — incluye los activos
 * (ya empezaron pero no terminaron) y los próximos. Se ordenan por desde_ts
 * ascendente para que el admin vea primero "lo más cercano".
 */
export async function listBloqueosVigentes(): Promise<BloqueoVigente[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: bloqueosAgenda.id,
      barberoId: bloqueosAgenda.barberoId,
      barberoNombre: barberos.nombre,
      desdeTs: bloqueosAgenda.desdeTs,
      hastaTs: bloqueosAgenda.hastaTs,
      motivo: bloqueosAgenda.motivo,
    })
    .from(bloqueosAgenda)
    .leftJoin(barberos, eq(barberos.id, bloqueosAgenda.barberoId))
    .where(gte(bloqueosAgenda.hastaTs, now))
    .orderBy(asc(bloqueosAgenda.desdeTs));
  return rows;
}

export type BloqueoRecurrenteItem = {
  id: string;
  barberoId: string;
  barberoNombre: string | null;
  diaSemana: number;
  /** "HH:MM" — sin segundos. */
  desdeHora: string;
  /** "HH:MM" — sin segundos. */
  hastaHora: string;
  motivo: string | null;
  activo: boolean;
};

/**
 * "HH:MM:SS" → "HH:MM" para presentación.
 */
function trimSecondsTime(hhmmss: string): string {
  const parts = hhmmss.split(":");
  const hh = (parts[0] ?? "00").padStart(2, "0");
  const mm = (parts[1] ?? "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Bloqueos recurrentes (todos), ordenados por barbero → día de semana → hora.
 * Incluye activos e inactivos: el admin ve y gestiona ambos.
 */
export async function listBloqueosRecurrentes(): Promise<
  BloqueoRecurrenteItem[]
> {
  const rows = await db
    .select({
      id: bloqueosRecurrentes.id,
      barberoId: bloqueosRecurrentes.barberoId,
      barberoNombre: barberos.nombre,
      diaSemana: bloqueosRecurrentes.diaSemana,
      desdeHora: bloqueosRecurrentes.desdeHora,
      hastaHora: bloqueosRecurrentes.hastaHora,
      motivo: bloqueosRecurrentes.motivo,
      activo: bloqueosRecurrentes.activo,
    })
    .from(bloqueosRecurrentes)
    .leftJoin(barberos, eq(barberos.id, bloqueosRecurrentes.barberoId))
    .orderBy(
      asc(barberos.orden),
      asc(barberos.nombre),
      asc(bloqueosRecurrentes.diaSemana),
      asc(bloqueosRecurrentes.desdeHora)
    );

  return rows.map((r) => ({
    ...r,
    desdeHora: trimSecondsTime(r.desdeHora),
    hastaHora: trimSecondsTime(r.hastaHora),
  }));
}

/**
 * Pasados — opcional para auditoría. No se usa por default en la UI pero
 * dejamos la query lista para activarla con un toggle si hace falta.
 */
export async function listBloqueosPasados(
  limit = 50
): Promise<BloqueoVigente[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: bloqueosAgenda.id,
      barberoId: bloqueosAgenda.barberoId,
      barberoNombre: barberos.nombre,
      desdeTs: bloqueosAgenda.desdeTs,
      hastaTs: bloqueosAgenda.hastaTs,
      motivo: bloqueosAgenda.motivo,
    })
    .from(bloqueosAgenda)
    .leftJoin(barberos, eq(barberos.id, bloqueosAgenda.barberoId))
    .where(lt(bloqueosAgenda.hastaTs, now))
    .orderBy(desc(bloqueosAgenda.desdeTs))
    .limit(limit);
  return rows;
}
