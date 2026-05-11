import "server-only";

import { and, eq, lt, or, sql as dsql } from "drizzle-orm";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { db } from "@/db/client";
import {
  barberos,
  bloqueosAgenda,
  diasDescansoRecurrente,
  horariosOperacion,
  servicios,
  turnos,
} from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Granularidad de los slots ofrecidos al usuario, en minutos.
 * 15min es el estándar de la industria y permite elegir 10:00, 10:15, 10:30...
 */
export const SLOT_STEP_MIN = 15;

/**
 * Tiempo mínimo de antelación entre "ahora" y el inicio del slot ofrecido.
 * Evita que el cliente reserve un turno que arranca en 2 minutos
 * (sin tiempo a que el barbero lo vea, sin walk).
 */
export const MIN_LEAD_MINUTES = 30;

export type SlotDisponible = {
  /** "HH:mm" en TZ del local. Sirve para el UI. */
  slot: string;
  /** Inicio en UTC (Date). */
  inicioTs: Date;
  /** Fin = inicio + duración del servicio, UTC. */
  finTs: Date;
};

type GetAvailableSlotsParams = {
  barberoId: string;
  servicioId: string;
  /** "YYYY-MM-DD" en TZ del local. */
  fecha: string;
};

/**
 * Devuelve los slots disponibles para reservar.
 *
 * Reglas:
 *  - Si el día es descanso recurrente del local → array vacío.
 *  - Toma todos los rangos de horarios_operacion del día.
 *  - Resta bloqueos del barbero (puntuales) que tocan ese día.
 *  - Resta turnos confirmados del barbero ese día.
 *  - Filtra slots que se pasarían del cierre del rango con la duración del servicio.
 *
 * Devuelve UTC + label en TZ local. El consumidor decide qué muestra.
 */
export async function getAvailableSlots(
  params: GetAvailableSlotsParams
): Promise<SlotDisponible[]> {
  const { barberoId, servicioId, fecha } = params;
  const tz = env.TIMEZONE;

  // 1. Validar barbero y servicio activos.
  const [b] = await db
    .select({ id: barberos.id, activo: barberos.activo })
    .from(barberos)
    .where(eq(barberos.id, barberoId))
    .limit(1);
  if (!b || !b.activo) return [];

  const [s] = await db
    .select({
      id: servicios.id,
      activo: servicios.activo,
      duracionMin: servicios.duracionMin,
    })
    .from(servicios)
    .where(eq(servicios.id, servicioId))
    .limit(1);
  if (!s || !s.activo) return [];

  const duracionMs = s.duracionMin * 60_000;

  // 2. Calcular día de la semana en TZ del local.
  // fecha viene como "YYYY-MM-DD" — la interpreto como medianoche local.
  const dayStartLocalISO = `${fecha}T00:00:00`;
  const dayStartUTC = fromZonedTime(dayStartLocalISO, tz);
  const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000);

  const diaSemana = toZonedTime(dayStartUTC, tz).getDay(); // 0..6

  // 3. ¿Día de descanso recurrente?
  const [descanso] = await db
    .select({ diaSemana: diasDescansoRecurrente.diaSemana })
    .from(diasDescansoRecurrente)
    .where(eq(diasDescansoRecurrente.diaSemana, diaSemana))
    .limit(1);
  if (descanso) return [];

  // 4. Rangos de horarios_operacion del día.
  const rangos = await db
    .select({
      apertura: horariosOperacion.apertura,
      cierre: horariosOperacion.cierre,
    })
    .from(horariosOperacion)
    .where(
      and(
        eq(horariosOperacion.diaSemana, diaSemana),
        eq(horariosOperacion.activo, true)
      )
    );

  if (rangos.length === 0) return [];

  // 5. Turnos confirmados del barbero que tocan el día (cualquier solapamiento con [dayStart, dayEnd)).
  const turnosDelDia = await db
    .select({ inicioTs: turnos.inicioTs, finTs: turnos.finTs })
    .from(turnos)
    .where(
      and(
        eq(turnos.barberoId, barberoId),
        eq(turnos.estado, "confirmado"),
        // pre-filtro grueso por inicio < dayEnd; el overlap exacto lo refino abajo.
        lt(turnos.inicioTs, dayEndUTC)
      )
    );
  // Filtro exacto en JS — overlap [inicio, fin) con [dayStart, dayEnd):
  const turnosOcupados = turnosDelDia.filter(
    (t) => t.finTs > dayStartUTC && t.inicioTs < dayEndUTC
  );

  // 6. Bloqueos puntuales del barbero (o globales: barbero_id null) que tocan el día.
  const bloqueos = await db
    .select({
      barberoId: bloqueosAgenda.barberoId,
      desdeTs: bloqueosAgenda.desdeTs,
      hastaTs: bloqueosAgenda.hastaTs,
    })
    .from(bloqueosAgenda)
    .where(
      and(
        or(
          eq(bloqueosAgenda.barberoId, barberoId),
          dsql`${bloqueosAgenda.barberoId} IS NULL`
        ),
        lt(bloqueosAgenda.desdeTs, dayEndUTC)
      )
    );
  const bloqueosDelDia = bloqueos.filter(
    (bl) => bl.hastaTs > dayStartUTC && bl.desdeTs < dayEndUTC
  );

  // 7. Generar slots para cada rango horario.
  // Filtramos slots cuyo inicio cae antes de "ahora + lead time" — sin esto,
  // hoy siempre muestra horarios pasados y el cliente choca contra el check
  // "ya pasó" del server action.
  const minStartMs = Date.now() + MIN_LEAD_MINUTES * 60_000;
  const out: SlotDisponible[] = [];

  for (const rango of rangos) {
    const aperturaUTC = parseTimeOnDate(fecha, rango.apertura, tz);
    const cierreUTC = parseTimeOnDate(fecha, rango.cierre, tz);

    // Última hora válida de inicio = cierre - duracion.
    const ultimoInicioMs = cierreUTC.getTime() - duracionMs;

    let cursorMs = aperturaUTC.getTime();
    while (cursorMs <= ultimoInicioMs) {
      if (cursorMs < minStartMs) {
        cursorMs += SLOT_STEP_MIN * 60_000;
        continue;
      }

      const inicio = new Date(cursorMs);
      const fin = new Date(cursorMs + duracionMs);

      const ocupado = turnosOcupados.some((t) =>
        rangesOverlap(inicio, fin, t.inicioTs, t.finTs)
      );
      const bloqueado = bloqueosDelDia.some((bl) =>
        rangesOverlap(inicio, fin, bl.desdeTs, bl.hastaTs)
      );

      if (!ocupado && !bloqueado) {
        out.push({
          slot: formatHHmmInTz(inicio, tz),
          inicioTs: inicio,
          finTs: fin,
        });
      }

      cursorMs += SLOT_STEP_MIN * 60_000;
    }
  }

  return out;
}

/**
 * Solapamiento de rangos semi-abiertos [aIni, aFin) y [bIni, bFin).
 */
export function rangesOverlap(
  aIni: Date,
  aFin: Date,
  bIni: Date,
  bFin: Date
): boolean {
  return aIni < bFin && bIni < aFin;
}

/**
 * Toma una fecha "YYYY-MM-DD" + hora "HH:mm:ss" interpretadas en `tz`,
 * y devuelve un Date UTC.
 */
function parseTimeOnDate(fecha: string, hora: string, tz: string): Date {
  // hora puede venir "HH:mm" o "HH:mm:ss". Normalizo.
  const partes = hora.split(":");
  const hh = (partes[0] ?? "00").padStart(2, "0");
  const mm = (partes[1] ?? "00").padStart(2, "0");
  const ss = (partes[2] ?? "00").padStart(2, "0");
  const localISO = `${fecha}T${hh}:${mm}:${ss}`;
  return fromZonedTime(localISO, tz);
}

/**
 * Formatea un Date UTC como "HH:mm" en la TZ dada.
 */
function formatHHmmInTz(date: Date, tz: string): string {
  const local = toZonedTime(date, tz);
  const hh = String(local.getHours()).padStart(2, "0");
  const mm = String(local.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// re-export para tests si los agregamos.
export { parseTimeOnDate, formatHHmmInTz };

// Helper que el flujo de UI necesita: dado un fecha "YYYY-MM-DD",
// determinar si el local atiende ese día (hay rangos y no es descanso).
export async function isDiaAbierto(fecha: string): Promise<boolean> {
  const tz = env.TIMEZONE;
  const dayStartUTC = fromZonedTime(`${fecha}T00:00:00`, tz);
  const diaSemana = toZonedTime(dayStartUTC, tz).getDay();

  const [descanso] = await db
    .select({ diaSemana: diasDescansoRecurrente.diaSemana })
    .from(diasDescansoRecurrente)
    .where(eq(diasDescansoRecurrente.diaSemana, diaSemana))
    .limit(1);
  if (descanso) return false;

  const rangos = await db
    .select({ id: horariosOperacion.id })
    .from(horariosOperacion)
    .where(
      and(
        eq(horariosOperacion.diaSemana, diaSemana),
        eq(horariosOperacion.activo, true)
      )
    )
    .limit(1);

  return rangos.length > 0;
}

