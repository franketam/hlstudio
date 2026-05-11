import "server-only";

import { and, asc, eq, gte, lt } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/db/client";
import {
  barberos,
  clientes,
  servicios,
  turnos,
} from "@/db/schema";
import { env } from "@/lib/env";

export type TurnoAgendaRow = {
  id: string;
  inicioTs: Date;
  finTs: Date;
  estado: string;
  precioTotal: string;
  barberoNombre: string;
  servicioNombre: string;
  duracionMin: number;
  clienteNombre: string;
  clienteTelefono: string;
};

/**
 * Lista los turnos del día (en TZ local) ordenados por hora de inicio.
 * `fecha` viene como "YYYY-MM-DD" en TZ local.
 *
 * Incluye también los cancelados, distinguidos por estado, para que el admin
 * sepa qué pasó ese día.
 */
export async function listTurnosDelDia(
  fecha: string
): Promise<TurnoAgendaRow[]> {
  const tz = env.TIMEZONE;
  const dayStartUTC = fromZonedTime(`${fecha}T00:00:00`, tz);
  const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: turnos.id,
      inicioTs: turnos.inicioTs,
      finTs: turnos.finTs,
      estado: turnos.estado,
      precioTotal: turnos.precioTotal,
      barberoNombre: barberos.nombre,
      servicioNombre: servicios.nombre,
      duracionMin: servicios.duracionMin,
      clienteNombre: clientes.nombre,
      clienteTelefono: clientes.telefono,
    })
    .from(turnos)
    .innerJoin(barberos, eq(barberos.id, turnos.barberoId))
    .innerJoin(servicios, eq(servicios.id, turnos.servicioId))
    .innerJoin(clientes, eq(clientes.id, turnos.clienteId))
    .where(
      and(gte(turnos.inicioTs, dayStartUTC), lt(turnos.inicioTs, dayEndUTC))
    )
    .orderBy(asc(turnos.inicioTs), asc(barberos.nombre));

  return rows;
}
