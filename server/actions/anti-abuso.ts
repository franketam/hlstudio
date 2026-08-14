import "server-only";

import { and, count, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bloqueosAcceso, turnos } from "@/db/schema";
import type { BloqueoTipo } from "@/db/schema";

/**
 * Política anti-abuso del formulario público de reservas.
 *
 * Contexto (ago-2026): el local recibe oleadas de turnos falsos. Un caso
 * documentado: misma IP, 71 segundos, dos reservas con nombres que difieren en
 * una letra y tres teléfonos distintos, uno de ellos de otra provincia.
 *
 * Cuatro defensas independientes, porque atacan cosas distintas:
 *
 *  1. Lista negra por identificador (IP / email / teléfono).
 *  2. Tope de turnos activos por cliente — contra el que acapara agenda.
 *  3. Un solo turno por franja horaria — nadie se corta en dos sillas a la vez.
 *  4. Rate limit por IP (en `lib/rate-limit.ts`) — acota el ritmo.
 *
 * Nada de esto aplica al panel admin: el dueño tiene que poder cargar el
 * walk-in de alguien bloqueado que vino a dar la cara. Es contra el
 * formulario, no contra la persona.
 */

/**
 * Turnos futuros confirmados que un mismo cliente puede tener a la vez.
 * 3 es holgado para uso real y corta al que reserva media agenda.
 */
export const MAX_TURNOS_ACTIVOS = 3;

export type MotivoRechazoInterno =
  | "bloqueado_ip"
  | "bloqueado_email"
  | "bloqueado_telefono"
  | "tope_turnos_activos"
  | "franja_duplicada";

export type ChequeoAntiAbuso =
  | { permitido: true }
  | { permitido: false; motivo: MotivoRechazoInterno; detalle: string };

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/**
 * La MISMA normalización se aplica al guardar un bloqueo y al chequearlo. Si
 * divergen, el bloqueo no matchea nunca y falla en silencio — que es el peor
 * modo de fallar para una defensa: parece puesta y no hace nada.
 *
 * El teléfono se asume ya normalizado a E.164 por `normalizarTelefonoAR` antes
 * de llegar acá; esto solo saca espacios.
 */
export function normalizarValorBloqueo(
  tipo: BloqueoTipo,
  valor: string
): string {
  const v = valor.trim();
  // Email e IPv6 son case-insensitive; el teléfono en E.164 no tiene letras.
  return tipo === "telefono" ? v : v.toLowerCase();
}

// ---------------------------------------------------------------------------
// 1. Lista negra
// ---------------------------------------------------------------------------

export type IdentificadoresIntento = {
  ip: string | null;
  email: string | null;
  telefono: string | null;
};

/**
 * ¿Alguno de los identificadores del intento está bloqueado?
 *
 * Una sola query para los tres: son endpoints públicos en el camino crítico y
 * no vale hacer tres roundtrips a la base por reserva.
 */
export async function chequearBloqueos(
  ids: IdentificadoresIntento
): Promise<ChequeoAntiAbuso> {
  const candidatos: { tipo: BloqueoTipo; valor: string }[] = [];
  if (ids.ip) candidatos.push({ tipo: "ip", valor: ids.ip });
  if (ids.email) candidatos.push({ tipo: "email", valor: ids.email });
  if (ids.telefono) candidatos.push({ tipo: "telefono", valor: ids.telefono });

  const normalizados = candidatos.map((c) => ({
    tipo: c.tipo,
    valor: normalizarValorBloqueo(c.tipo, c.valor),
  }));
  if (normalizados.length === 0) return { permitido: true };

  const hits = await db
    .select({ tipo: bloqueosAcceso.tipo, valor: bloqueosAcceso.valor })
    .from(bloqueosAcceso)
    .where(
      and(
        eq(bloqueosAcceso.activo, true),
        or(
          ...normalizados.map((n) =>
            and(eq(bloqueosAcceso.tipo, n.tipo), eq(bloqueosAcceso.valor, n.valor))
          )
        )
      )
    );

  const hit = hits[0];
  if (!hit) return { permitido: true };

  return {
    permitido: false,
    motivo: `bloqueado_${hit.tipo}` as MotivoRechazoInterno,
    detalle: `${hit.tipo}=${hit.valor}`,
  };
}

// ---------------------------------------------------------------------------
// 2 y 3. Límites por cliente
// ---------------------------------------------------------------------------

/**
 * Chequeos que dependen de un cliente que ya existe en la base.
 *
 * Para un teléfono que nunca reservó no hay nada que chequear, por eso el
 * caller pasa `null` y esto devuelve permitido sin tocar la base.
 *
 * @param inicio  inicio del turno que se quiere crear
 * @param fin     fin del turno que se quiere crear
 */
export async function chequearLimitesCliente(
  clienteId: string | null,
  inicio: Date,
  fin: Date
): Promise<ChequeoAntiAbuso> {
  if (!clienteId) return { permitido: true };

  // Un solo turno por franja: el caso real fue una persona reservando el mismo
  // horario con los dos barberos, con 50 segundos de diferencia. No puede estar
  // en dos sillas a la vez, así que uno de los dos iba a quedar vacío.
  const solapados = await db
    .select({ id: turnos.id })
    .from(turnos)
    .where(
      and(
        eq(turnos.clienteId, clienteId),
        eq(turnos.estado, "confirmado"),
        lt(turnos.inicioTs, fin),
        gt(turnos.finTs, inicio)
      )
    )
    .limit(1);

  if (solapados.length > 0) {
    return {
      permitido: false,
      motivo: "franja_duplicada",
      detalle: `cliente=${clienteId} ya tiene un turno en esa franja`,
    };
  }

  const [row] = await db
    .select({ n: count() })
    .from(turnos)
    .where(
      and(
        eq(turnos.clienteId, clienteId),
        eq(turnos.estado, "confirmado"),
        gt(turnos.inicioTs, new Date())
      )
    );

  const activos = row?.n ?? 0;
  if (activos >= MAX_TURNOS_ACTIVOS) {
    return {
      permitido: false,
      motivo: "tope_turnos_activos",
      detalle: `cliente=${clienteId} activos=${activos}`,
    };
  }

  return { permitido: true };
}

// ---------------------------------------------------------------------------
// Escritura de bloqueos (lo usa el panel admin)
// ---------------------------------------------------------------------------

export type NuevoBloqueo = {
  tipo: BloqueoTipo;
  valor: string;
  motivo?: string | null;
  turnoOrigenId?: string | null;
};

/**
 * Da de alta bloqueos. Idempotente: re-bloquear un identificador ya listado
 * reactiva la fila y actualiza el motivo en vez de fallar por el unique.
 *
 * Devuelve los valores efectivamente bloqueados, ya normalizados.
 */
export async function bloquearIdentificadores(
  entradas: NuevoBloqueo[]
): Promise<{ tipo: BloqueoTipo; valor: string }[]> {
  const filas = entradas
    .map((e) => ({
      tipo: e.tipo,
      valor: normalizarValorBloqueo(e.tipo, e.valor),
      motivo: e.motivo ?? null,
      turnoOrigenId: e.turnoOrigenId ?? null,
    }))
    .filter((f) => f.valor.length > 0);

  if (filas.length === 0) return [];

  await db
    .insert(bloqueosAcceso)
    .values(filas)
    .onConflictDoUpdate({
      target: [bloqueosAcceso.tipo, bloqueosAcceso.valor],
      set: {
        activo: true,
        motivo: sql`excluded.motivo`,
        turnoOrigenId: sql`excluded.turno_origen_id`,
        updatedAt: new Date(),
      },
    });

  return filas.map((f) => ({ tipo: f.tipo, valor: f.valor }));
}

/** Desactiva bloqueos por id. No borra la fila: preserva el historial. */
export async function desbloquearPorIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const filas = await db
    .update(bloqueosAcceso)
    .set({ activo: false, updatedAt: new Date() })
    .where(inArray(bloqueosAcceso.id, ids))
    .returning({ id: bloqueosAcceso.id });
  return filas.length;
}
