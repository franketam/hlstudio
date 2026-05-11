import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  barberos,
  clientes,
  notificacionesEnviadas,
  servicios,
  turnos,
} from "@/db/schema";
import * as schema from "@/db/schema";
import { sendEmail } from "./client";
import {
  renderRecordatorioCliente,
  type RecordatorioTipo,
} from "./templates/recordatorio-cliente";

/**
 * Este módulo NO importa `@/db/client` para poder ser usado desde:
 *  - server actions / route handlers de Next (pasar el `db` compartido)
 *  - scripts CLI standalone (pasar un db local, sin `server-only`)
 *
 * El bundler de scripts (esbuild standalone .mjs) explota si toca `server-only`.
 */
export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Tipo de notificación que se persiste en `notificaciones_enviadas.tipo`.
 * Convención existente: `confirmacion_cliente`, `confirmacion_barbero`.
 */
const TIPO_NOTIF: Record<RecordatorioTipo, string> = {
  "24h": "recordatorio_24h",
  "2h": "recordatorio_2h",
};

/**
 * Resend devuelve un `error.name` cuando rebota. Estos nombres significan
 * "fallo permanente" (email mal formado, dominio rechazado, etc.) — no tiene
 * sentido reintentar. Cualquier otro nombre (rate limit, server error) lo
 * consideramos transitorio y permitimos retry.
 *
 * Lista basada en docs públicas de Resend; agregar acá si aparece alguno nuevo.
 */
const ERROR_NAMES_PERMANENTES = new Set<string>([
  "validation_error",
  "invalid_email",
  "invalid_to_address",
  "invalid_from_address",
  "missing_required_field",
]);

export type CandidatoRecordatorio = {
  turnoId: string;
  inicio: Date;
  precioTotal: string;
  cancelToken: string;
  clienteNombre: string;
  clienteEmail: string | null;
  barberoNombre: string;
  servicioNombre: string;
  servicioDuracionMin: number;
};

/**
 * Busca turnos confirmados cuyo `inicio_ts` cae dentro de la ventana del
 * recordatorio (24h: now+23h..now+25h; 2h: now+1h..now+3h) y que todavía
 * no tienen registro en `notificaciones_enviadas` para ese tipo.
 *
 * Importante: la query NO filtra por email NULL — lo manejamos arriba para
 * loggear "skipped_no_email" y dejar registrado el caso (sin marcar enviado,
 * porque tampoco tiene sentido retry — pero queda en logs para que el admin
 * vea que esos turnos no recibieron aviso).
 *
 * Filtra también `inicio_ts >= now` para no procesar turnos ya pasados
 * (defensa contra cron que se atrasa mucho).
 */
export async function findCandidatos(
  db: Db,
  tipo: RecordatorioTipo,
  now: Date
): Promise<CandidatoRecordatorio[]> {
  const tipoStr = TIPO_NOTIF[tipo];
  const { desde, hasta } = ventana(tipo, now);

  // LEFT JOIN con notificaciones_enviadas filtrando por tipo:
  // si no hay match, queda NULL → es candidato.
  const rows = await db
    .select({
      turnoId: turnos.id,
      inicio: turnos.inicioTs,
      precioTotal: turnos.precioTotal,
      cancelToken: turnos.cancelToken,
      clienteNombre: clientes.nombre,
      clienteEmail: clientes.email,
      barberoNombre: barberos.nombre,
      servicioNombre: servicios.nombre,
      servicioDuracionMin: servicios.duracionMin,
      notifId: notificacionesEnviadas.id,
    })
    .from(turnos)
    .innerJoin(clientes, eq(clientes.id, turnos.clienteId))
    .innerJoin(barberos, eq(barberos.id, turnos.barberoId))
    .innerJoin(servicios, eq(servicios.id, turnos.servicioId))
    .leftJoin(
      notificacionesEnviadas,
      and(
        eq(notificacionesEnviadas.turnoId, turnos.id),
        eq(notificacionesEnviadas.tipo, tipoStr)
      )
    )
    .where(
      and(
        eq(turnos.estado, "confirmado"),
        gte(turnos.inicioTs, desde),
        lte(turnos.inicioTs, hasta),
        gte(turnos.inicioTs, now),
        isNull(notificacionesEnviadas.id)
      )
    );

  return rows.map((r) => ({
    turnoId: r.turnoId,
    inicio: r.inicio,
    precioTotal: r.precioTotal,
    cancelToken: r.cancelToken,
    clienteNombre: r.clienteNombre,
    clienteEmail: r.clienteEmail,
    barberoNombre: r.barberoNombre,
    servicioNombre: r.servicioNombre,
    servicioDuracionMin: r.servicioDuracionMin,
  }));
}

/**
 * Ventana de búsqueda para cada tipo. Asume que el cron corre cada ~10 min;
 * la ventana es 2h en cada lado del punto objetivo para tolerar reinicios
 * y desfases de scheduler sin perder envíos.
 */
export function ventana(
  tipo: RecordatorioTipo,
  now: Date
): { desde: Date; hasta: Date } {
  if (tipo === "24h") {
    return {
      desde: new Date(now.getTime() + 23 * 3_600_000),
      hasta: new Date(now.getTime() + 25 * 3_600_000),
    };
  }
  // 2h
  return {
    desde: new Date(now.getTime() + 1 * 3_600_000),
    hasta: new Date(now.getTime() + 3 * 3_600_000),
  };
}

export type ProcesarResultado =
  | { ok: true; turnoId: string; tipo: RecordatorioTipo; providerId: string | null }
  | {
      ok: false;
      turnoId: string;
      tipo: RecordatorioTipo;
      code:
        | "skipped_no_email"
        | "claim_lost"
        | "send_failed_permanente"
        | "send_failed_transitorio"
        | "internal_error";
      detail?: string;
    };

/**
 * Procesa un candidato: claim atómico + envío + persist resultado.
 *
 * Idempotencia: insert `notificaciones_enviadas (turno_id, tipo)` con
 * `ON CONFLICT DO NOTHING`. Si afectó 0 filas, otro proceso ya lo agarró.
 *
 * Manejo de errores:
 *  - Sin email cliente → no inserta el lock, devuelve "skipped_no_email".
 *  - Error Resend permanente (email inválido) → deja el row de lock con `error`,
 *    no reintenta nunca.
 *  - Error Resend transitorio → DELETE del row para permitir retry en el próximo
 *    barrido. El registro se vuelve a crear cuando se reintente.
 */
export async function procesarCandidato(
  db: Db,
  cand: CandidatoRecordatorio,
  tipo: RecordatorioTipo,
  opts: { dryRun?: boolean; appUrl: string } = { appUrl: "" }
): Promise<ProcesarResultado> {
  const tipoStr = TIPO_NOTIF[tipo];

  if (!cand.clienteEmail) {
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      code: "skipped_no_email",
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      turnoId: cand.turnoId,
      tipo,
      providerId: null,
    };
  }

  // Claim atómico: si ON CONFLICT no devuelve fila, otro proceso lo agarró.
  let claimed: { id: string } | undefined;
  try {
    const inserted = await db
      .insert(notificacionesEnviadas)
      .values({
        turnoId: cand.turnoId,
        tipo: tipoStr,
      })
      .onConflictDoNothing({
        target: [notificacionesEnviadas.turnoId, notificacionesEnviadas.tipo],
      })
      .returning({ id: notificacionesEnviadas.id });
    claimed = inserted[0];
  } catch (err) {
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      code: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!claimed) {
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      code: "claim_lost",
    };
  }

  const cancelUrl = `${opts.appUrl.replace(/\/$/, "")}/turno/${cand.cancelToken}`;
  const rendered = renderRecordatorioCliente({
    tipo,
    clienteNombre: cand.clienteNombre,
    barberoNombre: cand.barberoNombre,
    servicioNombre: cand.servicioNombre,
    inicio: cand.inicio,
    duracionMin: cand.servicioDuracionMin,
    precioTotal: cand.precioTotal,
    cancelUrl,
  });

  let sendResult: Awaited<ReturnType<typeof sendEmail>>;
  try {
    sendResult = await sendEmail({
      to: cand.clienteEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (err) {
    sendResult = {
      ok: false,
      error: `exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (sendResult.ok) {
    try {
      await db
        .update(notificacionesEnviadas)
        .set({ proveedorId: sendResult.providerId })
        .where(eq(notificacionesEnviadas.id, claimed.id));
    } catch (err) {
      // No es crítico — el lock ya quedó, no se reintenta.
      console.warn(
        `[recordatorio] no se pudo persistir proveedorId para ${cand.turnoId}:`,
        err instanceof Error ? err.message : err
      );
    }
    return {
      ok: true,
      turnoId: cand.turnoId,
      tipo,
      providerId: sendResult.providerId,
    };
  }

  // Falló el envío. Decidir si es permanente o transitorio.
  const esPermanente =
    sendResult.errorName !== undefined &&
    ERROR_NAMES_PERMANENTES.has(sendResult.errorName);

  if (esPermanente) {
    // Marcamos el lock con el error y NO reintentamos.
    try {
      await db
        .update(notificacionesEnviadas)
        .set({ error: sendResult.error })
        .where(eq(notificacionesEnviadas.id, claimed.id));
    } catch (err) {
      console.warn(
        `[recordatorio] no se pudo persistir error permanente para ${cand.turnoId}:`,
        err instanceof Error ? err.message : err
      );
    }
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      code: "send_failed_permanente",
      detail: sendResult.error,
    };
  }

  // Transitorio: borramos el lock para permitir retry en el próximo barrido.
  try {
    await db
      .delete(notificacionesEnviadas)
      .where(eq(notificacionesEnviadas.id, claimed.id));
  } catch (err) {
    console.warn(
      `[recordatorio] no se pudo liberar el lock tras error transitorio para ${cand.turnoId}:`,
      err instanceof Error ? err.message : err
    );
  }
  return {
    ok: false,
    turnoId: cand.turnoId,
    tipo,
    code: "send_failed_transitorio",
    detail: sendResult.error,
  };
}
