import "server-only";

import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { barberos, clientes, servicios, turnos } from "@/db/schema";
import { normalizarTelefonoAR } from "@/lib/phone";

/**
 * Queries del panel admin para la sección "Clientes" (RF-09).
 *
 * Diseño:
 *  - `searchClientes` devuelve top N por última visita si no hay query, o filtra
 *    por nombre/teléfono ILIKE. Una sola query con JOIN agregado para evitar N+1.
 *  - Métricas calculadas en BD (más barato que traer todos los turnos y agregar
 *    en JS):
 *      · totalTurnos: count(*) — incluye cancelados y no-shows (informativo).
 *      · ultimaVisita: max(inicio_ts) de turnos NO cancelados (cancelados no
 *        cuentan como "visita"; sí cuentan completados, confirmados y no_show).
 *      · gastoTotal: sum(precio_total) de turnos confirmado + completado (los
 *        cancelados no se cobran; un no_show podría haberse cobrado pero por
 *        simplicidad y conservadurismo lo excluimos del gasto acumulado).
 *  - Los conteos / sumas vuelven de pg como string — convertimos a number en la
 *    capa de presentación.
 */

/**
 * Estados que cuentan como "visita realizada" para la métrica de última visita
 * y la frecuencia (separar de los que cuentan para gasto).
 */
const ESTADOS_VISITA = sql`('confirmado', 'completado', 'no_show')`;

/**
 * Estados que generan ingreso real (suma a gasto acumulado).
 */
const ESTADOS_FACTURABLES = sql`('confirmado', 'completado')`;

export type ClienteListRow = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  totalTurnos: number;
  /** Fecha del último turno NO cancelado. Null si nunca tuvo un turno válido. */
  ultimaVisita: Date | null;
  /** Suma en ARS de turnos confirmado + completado. String numérico de pg. */
  gastoTotal: string;
};

/**
 * Busca clientes para la vista de listado.
 *
 * - Sin `query`: devuelve los `limit` clientes con turno más reciente (top
 *   actividad). Clientes sin turnos no aparecen acá: el caso de uso es
 *   "qué cliente vino hace poco".
 * - Con `query`: filtra por `nombre ILIKE %q%` OR `telefono ILIKE %q_norm%`.
 *   El teléfono se intenta normalizar a E.164 antes del match (lax). El nombre
 *   se busca literal — los apellidos compuestos quedan cubiertos por contains.
 *   En este modo SÍ devolvemos clientes sin turnos (búsqueda exacta = el
 *   admin sabe a quién busca; debe poder encontrarlo aunque no haya venido aún).
 */
export async function searchClientes(
  query?: string,
  limit = 20
): Promise<ClienteListRow[]> {
  const q = query?.trim() ?? "";

  // Métricas agregadas como subqueries correlacionadas no escalan;
  // usamos LEFT JOIN + GROUP BY que con índice por (cliente_id, inicio_ts) es eficiente.
  const baseSelect = {
    id: clientes.id,
    nombre: clientes.nombre,
    telefono: clientes.telefono,
    email: clientes.email,
    totalTurnos: sql<number>`count(${turnos.id})::int`.as("total_turnos"),
    ultimaVisita: sql<Date | null>`max(${turnos.inicioTs}) filter (where ${turnos.estado} in ${ESTADOS_VISITA})`.as(
      "ultima_visita"
    ),
    gastoTotal: sql<string>`coalesce(sum(${turnos.precioTotal}) filter (where ${turnos.estado} in ${ESTADOS_FACTURABLES}), 0)::text`.as(
      "gasto_total"
    ),
  };

  if (q.length === 0) {
    // Top por última visita. Requiere que tenga al menos un turno "visita".
    const rows = await db
      .select(baseSelect)
      .from(clientes)
      .innerJoin(turnos, eq(turnos.clienteId, clientes.id))
      .groupBy(clientes.id)
      .having(
        sql`max(${turnos.inicioTs}) filter (where ${turnos.estado} in ${ESTADOS_VISITA}) is not null`
      )
      .orderBy(
        desc(
          sql`max(${turnos.inicioTs}) filter (where ${turnos.estado} in ${ESTADOS_VISITA})`
        )
      )
      .limit(limit);
    return rows;
  }

  // Búsqueda. Construyo el filtro con OR de nombre + teléfono.
  const pattern = `%${q}%`;
  const telefonoNorm = normalizarTelefonoAR(q);

  const filtros: SQL[] = [ilike(clientes.nombre, pattern)];
  // Para teléfono: si normaliza, busco por E.164 contains. Si no, busco por el
  // string crudo contains (cubre "1234" como sufijo) — el unique index sigue
  // soportando lookups por igualdad; este ILIKE puede escanear, pero el set
  // de clientes es chico (cientos / pocos miles) y la limit acota.
  if (telefonoNorm) {
    filtros.push(ilike(clientes.telefono, `%${telefonoNorm}%`));
  }
  filtros.push(ilike(clientes.telefono, pattern));

  const whereClause = or(...filtros);

  const rows = await db
    .select(baseSelect)
    .from(clientes)
    .leftJoin(turnos, eq(turnos.clienteId, clientes.id))
    .where(whereClause)
    .groupBy(clientes.id)
    .orderBy(
      // Primero los que tienen visita más reciente, después por nombre.
      desc(
        sql`max(${turnos.inicioTs}) filter (where ${turnos.estado} in ${ESTADOS_VISITA})`
      ),
      asc(clientes.nombre)
    )
    .limit(limit);

  return rows;
}

export type TurnoHistorial = {
  id: string;
  inicioTs: Date;
  finTs: Date;
  estado: string;
  precioTotal: string;
  barberoNombre: string;
  servicioNombre: string;
  duracionMin: number;
};

export type ClienteDetalle = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  notasAdmin: string | null;
  createdAt: Date;
  turnos: TurnoHistorial[];
};

/**
 * Devuelve el cliente + historial completo de turnos ordenado por fecha desc.
 * Null si no existe.
 */
export async function getClienteByIdConHistorial(
  id: string
): Promise<ClienteDetalle | null> {
  const [cliente] = await db
    .select({
      id: clientes.id,
      nombre: clientes.nombre,
      telefono: clientes.telefono,
      email: clientes.email,
      notasAdmin: clientes.notasAdmin,
      createdAt: clientes.createdAt,
    })
    .from(clientes)
    .where(eq(clientes.id, id))
    .limit(1);

  if (!cliente) return null;

  const turnosRows = await db
    .select({
      id: turnos.id,
      inicioTs: turnos.inicioTs,
      finTs: turnos.finTs,
      estado: turnos.estado,
      precioTotal: turnos.precioTotal,
      barberoNombre: barberos.nombre,
      servicioNombre: servicios.nombre,
      duracionMin: servicios.duracionMin,
    })
    .from(turnos)
    .innerJoin(barberos, eq(barberos.id, turnos.barberoId))
    .innerJoin(servicios, eq(servicios.id, turnos.servicioId))
    .where(eq(turnos.clienteId, id))
    .orderBy(desc(turnos.inicioTs));

  return {
    ...cliente,
    turnos: turnosRows,
  };
}

export type ClienteMetricas = {
  /** Total de turnos (todos los estados). */
  totalTurnos: number;
  /** Cantidad de "visitas" (confirmado/completado/no_show — no canceladas). */
  totalVisitas: number;
  /** Última visita. Null si nunca. */
  ultimaVisita: Date | null;
  /** Primera visita. Null si nunca. */
  primeraVisita: Date | null;
  /**
   * Promedio de días entre visitas. Null si hay 0 o 1 visita.
   * Se calcula como (ultima - primera) / (totalVisitas - 1).
   */
  frecuenciaDias: number | null;
  /** Gasto acumulado en ARS — turnos confirmado + completado. */
  gastoTotal: number;
};

/**
 * Calcula las métricas del cliente a partir del array de turnos del historial.
 * Hacemos el cálculo en JS y no en BD: simplifica la query principal y la cantidad
 * de turnos por cliente es chica (decenas, no millones).
 */
export function calcularMetricas(
  turnosHistorial: TurnoHistorial[]
): ClienteMetricas {
  const estadosVisita = new Set([
    "confirmado",
    "completado",
    "no_show",
  ]);
  const estadosFacturables = new Set(["confirmado", "completado"]);

  let totalVisitas = 0;
  let ultimaVisita: Date | null = null;
  let primeraVisita: Date | null = null;
  let gastoTotal = 0;

  for (const t of turnosHistorial) {
    if (estadosVisita.has(t.estado)) {
      totalVisitas++;
      const ts = t.inicioTs.getTime();
      if (!ultimaVisita || ts > ultimaVisita.getTime()) ultimaVisita = t.inicioTs;
      if (!primeraVisita || ts < primeraVisita.getTime())
        primeraVisita = t.inicioTs;
    }
    if (estadosFacturables.has(t.estado)) {
      const n = Number(t.precioTotal);
      if (Number.isFinite(n)) gastoTotal += n;
    }
  }

  let frecuenciaDias: number | null = null;
  if (totalVisitas > 1 && ultimaVisita && primeraVisita) {
    const span = ultimaVisita.getTime() - primeraVisita.getTime();
    const dias = span / (1000 * 60 * 60 * 24);
    frecuenciaDias = Math.round(dias / (totalVisitas - 1));
  }

  return {
    totalTurnos: turnosHistorial.length,
    totalVisitas,
    ultimaVisita,
    primeraVisita,
    frecuenciaDias,
    gastoTotal,
  };
}
