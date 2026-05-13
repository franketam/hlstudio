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
import {
  renderRecordatorioCliente,
  type RecordatorioTipo,
} from "./templates/recordatorio-cliente";
import { renderRecordatorioClienteWa } from "@/server/whatsapp/templates";
import {
  dispatchNotificacion,
  elegirCanal,
  telefonoParaWa,
  type Canal,
} from "@/server/notif/dispatch";

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
 * Convención: `recordatorio_24h`, `recordatorio_2h`.
 *
 * IMPORTANTE: el unique compuesto es (turno_id, tipo, canal). Para detectar
 * si un turno YA recibió el recordatorio (sin importar el canal), filtramos
 * sin canal: si hay cualquier fila para ese tipo, no es candidato.
 */
const TIPO_NOTIF: Record<RecordatorioTipo, string> = {
  "24h": "recordatorio_24h",
  "2h": "recordatorio_2h",
};

export type CandidatoRecordatorio = {
  turnoId: string;
  inicio: Date;
  precioTotal: string;
  cancelToken: string;
  clienteNombre: string;
  clienteEmail: string | null;
  clienteTelefono: string;
  barberoNombre: string;
  servicioNombre: string;
  servicioDuracionMin: number;
};

/**
 * Busca turnos confirmados cuyo `inicio_ts` cae dentro de la ventana del
 * recordatorio (24h: now+23h..now+25h; 2h: now+1h..now+3h) y que todavía
 * no tienen NINGÚN registro en `notificaciones_enviadas` para ese tipo
 * (cualquier canal).
 *
 * El LEFT JOIN filtra por tipo (sin canal) → si match, ya fue procesado
 * (por whatsapp o email) y no es candidato.
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

  const rows = await db
    .select({
      turnoId: turnos.id,
      inicio: turnos.inicioTs,
      precioTotal: turnos.precioTotal,
      cancelToken: turnos.cancelToken,
      clienteNombre: clientes.nombre,
      clienteEmail: clientes.email,
      clienteTelefono: clientes.telefono,
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
    clienteTelefono: r.clienteTelefono,
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
  return {
    desde: new Date(now.getTime() + 1 * 3_600_000),
    hasta: new Date(now.getTime() + 3 * 3_600_000),
  };
}

export type ProcesarResultado =
  | {
      ok: true;
      turnoId: string;
      tipo: RecordatorioTipo;
      canal: Canal;
      providerId: string | null;
    }
  | {
      ok: false;
      turnoId: string;
      tipo: RecordatorioTipo;
      canal: Canal | "ninguno";
      code:
        | "skipped_no_email"
        | "skipped_sin_destinatario"
        | "claim_lost"
        | "send_failed_permanente"
        | "send_failed_transitorio"
        | "internal_error";
      detail?: string;
    };

/**
 * Procesa un candidato: dispatch idempotente.
 *
 * Si dry-run, NO inserta el lock NI envía. Devuelve ok=true simulado para que
 * el caller pueda loguear "enviaria".
 */
export async function procesarCandidato(
  db: Db,
  cand: CandidatoRecordatorio,
  tipo: RecordatorioTipo,
  opts: { dryRun?: boolean; appUrl: string } = { appUrl: "" }
): Promise<ProcesarResultado> {
  const tipoStr = TIPO_NOTIF[tipo];

  const telefonoWa = telefonoParaWa(cand.clienteTelefono);
  const canalPrevisto = elegirCanal(cand.clienteTelefono);

  // Si el canal previsto es email y el cliente no tiene email → no podemos avisar.
  // (Cliente con teléfono y bot configurado siempre va por WA; este caso aplica
  //  solo cuando el bot está apagado.)
  if (canalPrevisto === "email" && !cand.clienteEmail) {
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      canal: "ninguno",
      code: "skipped_no_email",
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      turnoId: cand.turnoId,
      tipo,
      canal: canalPrevisto,
      providerId: null,
    };
  }

  const cancelUrl = `${opts.appUrl.replace(/\/$/, "")}/turno/${cand.cancelToken}`;
  const emailRendered = cand.clienteEmail
    ? renderRecordatorioCliente({
        tipo,
        clienteNombre: cand.clienteNombre,
        barberoNombre: cand.barberoNombre,
        servicioNombre: cand.servicioNombre,
        inicio: cand.inicio,
        duracionMin: cand.servicioDuracionMin,
        precioTotal: cand.precioTotal,
        cancelUrl,
      })
    : null;

  const waText = renderRecordatorioClienteWa({
    tipo,
    clienteNombre: cand.clienteNombre,
    barberoNombre: cand.barberoNombre,
    servicioNombre: cand.servicioNombre,
    inicio: cand.inicio,
    duracionMin: cand.servicioDuracionMin,
    cancelUrl,
  });

  const r = await dispatchNotificacion(db, {
    turnoId: cand.turnoId,
    tipo: tipoStr as "recordatorio_24h" | "recordatorio_2h",
    destinatarioTelefono: telefonoWa,
    destinatarioEmail: cand.clienteEmail,
    waText,
    emailPayload: {
      to: cand.clienteEmail ?? "",
      subject: emailRendered?.subject ?? "",
      html: emailRendered?.html ?? "",
      text: emailRendered?.text,
    },
  });

  if (r.ok) {
    return {
      ok: true,
      turnoId: cand.turnoId,
      tipo,
      canal: r.canal,
      providerId: r.providerId,
    };
  }

  // Mapeo de errores
  if (r.code === "skipped_sin_destinatario") {
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      canal: r.canal,
      code: "skipped_sin_destinatario",
    };
  }
  return {
    ok: false,
    turnoId: cand.turnoId,
    tipo,
    canal: r.canal,
    code: r.code,
    detail: r.detail,
  };
}
