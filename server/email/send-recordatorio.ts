import { and, eq, gte, lte, sql } from "drizzle-orm";
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
  type DispatchResult,
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
 * Convención: `recordatorio_24h`, `recordatorio_3h`.
 * (El recordatorio corto era `recordatorio_2h` hasta jul-2026; la migración
 * 0005 renombró las filas existentes.)
 *
 * IMPORTANTE: el unique compuesto es (turno_id, tipo, canal). Para detectar
 * si un turno YA recibió el recordatorio (sin importar el canal), filtramos
 * sin canal: si hay cualquier fila para ese tipo, no es candidato.
 */
const TIPO_NOTIF: Record<RecordatorioTipo, string> = {
  "24h": "recordatorio_24h",
  "3h": "recordatorio_3h",
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
 * recordatorio (24h: now+22h..now+24h; 3h: now+1h..now+3h) y que todavía
 * NO tienen los 2 canales aplicables enviados para ese tipo.
 *
 * Estrategia "both" para cliente: el turno puede tener hasta 2 filas en
 * `notificaciones_enviadas` (una por canal). Es candidato mientras tenga
 * MENOS DE 2 filas — eso permite reintentar el canal que falló transitorio
 * en el próximo barrido (el otro canal ya está locked y devuelve claim_lost
 * sin trabajo extra).
 *
 * Cliente sin teléfono: nunca llega a 2 filas (solo email). En estado
 * estable tendrá 1 fila → sigue siendo "candidato" pero el dispatcher hace
 * claim_lost en email y skip en WA (sin teléfono). Cero envíos extra.
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

  // Subquery correlada: cuenta filas en notificaciones_enviadas para (turno, tipo).
  const notifsCount = sql<number>`(
    SELECT COUNT(*)::int FROM ${notificacionesEnviadas}
    WHERE ${notificacionesEnviadas.turnoId} = ${turnos.id}
      AND ${notificacionesEnviadas.tipo} = ${tipoStr}
  )`;

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
    })
    .from(turnos)
    .innerJoin(clientes, eq(clientes.id, turnos.clienteId))
    .innerJoin(barberos, eq(barberos.id, turnos.barberoId))
    .innerJoin(servicios, eq(servicios.id, turnos.servicioId))
    .where(
      and(
        eq(turnos.estado, "confirmado"),
        gte(turnos.inicioTs, desde),
        lte(turnos.inicioTs, hasta),
        gte(turnos.inicioTs, now),
        sql`${notifsCount} < 2`
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
 * Ventana de búsqueda para cada tipo.
 *
 * OJO con la semántica: el turno ENTRA a la ventana por el borde superior
 * (`hasta`), y el barrido lo agarra en el primer tick donde califica. O sea
 * que `hasta` ES el punto objetivo: con cron cada ~10 min, el envío sale a
 * ~T-24h / ~T-3h (menos hasta 10 min de granularidad del cron).
 * El margen inferior (`desde`) NO es el objetivo — es tolerancia a caídas:
 * si el cron estuvo parado, el turno sigue siendo candidato hasta que falte
 * menos que `desde`.
 */
export function ventana(
  tipo: RecordatorioTipo,
  now: Date
): { desde: Date; hasta: Date } {
  if (tipo === "24h") {
    return {
      desde: new Date(now.getTime() + 22 * 3_600_000),
      hasta: new Date(now.getTime() + 24 * 3_600_000),
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
      /** Resultado per-canal (1 o 2 items según estrategia "both"). */
      perCanal?: DispatchResult[];
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
      perCanal?: DispatchResult[];
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

  // Cliente: estrategia "both" — manda WA + email en paralelo. Cada canal
  // tiene su propia idempotencia atómica (turno_id, tipo, canal).
  const results = await dispatchNotificacion(
    db,
    {
      turnoId: cand.turnoId,
      tipo: tipoStr as "recordatorio_24h" | "recordatorio_3h",
      destinatarioTelefono: telefonoWa,
      destinatarioEmail: cand.clienteEmail,
      waText,
      emailPayload: {
        to: cand.clienteEmail ?? "",
        subject: emailRendered?.subject ?? "",
        html: emailRendered?.html ?? "",
        text: emailRendered?.text,
      },
    },
    "both"
  );

  // El resultado "agregado" del turno es OK si al menos UN canal salió bien.
  // Los detalles per-canal van como array secundario para el cron loggee cada uno.
  const algunOk = results.find((r) => r.ok);
  if (algunOk && algunOk.ok) {
    return {
      ok: true,
      turnoId: cand.turnoId,
      tipo,
      canal: algunOk.canal,
      providerId: algunOk.providerId,
      perCanal: results,
    };
  }

  // Todos fallaron — devolver el primer error informativo (no claim_lost).
  const primerError =
    results.find((r) => !r.ok && r.code !== "claim_lost") ?? results[0];

  if (!primerError || primerError.ok) {
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      canal: "ninguno",
      code: "skipped_sin_destinatario",
      perCanal: results,
    };
  }

  if (primerError.code === "skipped_sin_destinatario") {
    return {
      ok: false,
      turnoId: cand.turnoId,
      tipo,
      canal: primerError.canal,
      code: "skipped_sin_destinatario",
      perCanal: results,
    };
  }
  return {
    ok: false,
    turnoId: cand.turnoId,
    tipo,
    canal: primerError.canal,
    code: primerError.code,
    detail: primerError.detail,
    perCanal: results,
  };
}
