/**
 * Dispatcher de notificaciones: persiste idempotencia en `notificaciones_enviadas`
 * por (turno_id, tipo, canal) y permite dos estrategias:
 *
 *  - "both" (cliente final): manda WA y email EN PARALELO cuando ambos canales
 *    están disponibles. Cada canal tiene su propia idempotencia atómica.
 *    Decisión del cliente: el email de hlstudio.com.ar todavía cae a spam en
 *    Gmail (dominio nuevo), así que mandamos los dos para garantizar entrega.
 *
 *  - "preferred" (barbero): manda WhatsApp si tiene teléfono + bot configurado,
 *    sino email. Sin fallback automático si el canal preferido falla. Lo que
 *    le sirve al barbero es la primera notificación útil, no dos.
 *
 * Cada canal individual es resiliente: si falla, queda registrado el error y
 * NO propaga la excepción al caller. El booking nunca rompe por un fallo de notif.
 *
 * Server-only. No importar desde Client Components.
 */

import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { notificacionesEnviadas } from "@/db/schema";
import * as schema from "@/db/schema";
import { sendEmail, type SendEmailInput } from "@/server/email/client";
import { sendWhatsApp, type SendWaResult } from "@/server/whatsapp/client";
import { normalizarTelefonoAR } from "@/lib/phone";

export type Db = PostgresJsDatabase<typeof schema>;

export type Canal = "whatsapp" | "email";

export type DispatchTipo =
  | "confirmacion_cliente"
  | "confirmacion_barbero"
  | "recordatorio_24h"
  | "recordatorio_3h"
  | "cancelacion_cliente"
  | "cancelacion_barbero";

/**
 * Input para WA + Email: ambos payloads se proveen, el dispatcher elige según
 * teléfono / config. Si elige WA y falla, NO usa el payload de email.
 */
export type DispatchInput = {
  turnoId: string;
  tipo: DispatchTipo;
  /** E.164 sin '+', null si el destinatario no tiene teléfono útil. */
  destinatarioTelefono: string | null;
  /** Email del destinatario, null si no tiene. */
  destinatarioEmail: string | null;
  /** Texto del mensaje WhatsApp (sin formato HTML). */
  waText: string;
  /** Payload para email. */
  emailPayload: SendEmailInput;
};

export type DispatchResult =
  | {
      ok: true;
      canal: Canal;
      providerId: string | null;
    }
  | {
      ok: false;
      canal: Canal | "ninguno";
      code:
        | "skipped_sin_destinatario"
        | "claim_lost"
        | "send_failed_permanente"
        | "send_failed_transitorio"
        | "internal_error";
      detail?: string;
    };

export type DispatchStrategy = "both" | "preferred";

/**
 * Dispatch principal. Devuelve un array de resultados (uno por canal intentado).
 *
 *  - strategy="both": intenta WA y email en paralelo. Cada uno con su propia
 *    idempotencia atómica. Array puede tener 0, 1 o 2 elementos según qué canales
 *    estén disponibles para este destinatario.
 *
 *  - strategy="preferred": elige UN canal según `elegirCanal` y solo manda por ese.
 *    Array siempre tiene 1 elemento (puede ser ok o fail).
 *
 * NUNCA propaga excepciones — los errores van en el array de resultados.
 */
export async function dispatchNotificacion(
  db: Db,
  input: DispatchInput,
  strategy: DispatchStrategy = "preferred"
): Promise<DispatchResult[]> {
  if (strategy === "both") {
    const tasks: Promise<DispatchResult>[] = [];
    if (input.destinatarioTelefono) {
      tasks.push(dispatchUnoCanal(db, input, "whatsapp"));
    }
    if (input.destinatarioEmail) {
      tasks.push(dispatchUnoCanal(db, input, "email"));
    }
    if (tasks.length === 0) {
      return [
        {
          ok: false,
          canal: "ninguno",
          code: "skipped_sin_destinatario",
        },
      ];
    }
    return Promise.all(tasks);
  }

  // "preferred": elegir un solo canal
  const canal: Canal = elegirCanal(input.destinatarioTelefono);
  if (canal === "whatsapp" && !input.destinatarioTelefono) {
    return [{ ok: false, canal: "ninguno", code: "skipped_sin_destinatario" }];
  }
  if (canal === "email" && !input.destinatarioEmail) {
    return [{ ok: false, canal: "ninguno", code: "skipped_sin_destinatario" }];
  }
  return [await dispatchUnoCanal(db, input, canal)];
}

/**
 * Dispatch para UN canal específico con idempotencia atómica.
 *
 *  - INSERT ... ON CONFLICT DO NOTHING sobre (turno_id, tipo, canal). Si devuelve
 *    0 filas, otro proceso ya lo procesó (claim_lost).
 *  - Si el envío falla:
 *      * permanente: dejar el row con `error`, no reintentar
 *      * transitorio: DELETE del row para permitir retry futuro
 */
async function dispatchUnoCanal(
  db: Db,
  input: DispatchInput,
  canal: Canal
): Promise<DispatchResult> {
  // Claim atómico
  let claimed: { id: string } | undefined;
  try {
    const inserted = await db
      .insert(notificacionesEnviadas)
      .values({
        turnoId: input.turnoId,
        tipo: input.tipo,
        canal,
      })
      .onConflictDoNothing({
        target: [
          notificacionesEnviadas.turnoId,
          notificacionesEnviadas.tipo,
          notificacionesEnviadas.canal,
        ],
      })
      .returning({ id: notificacionesEnviadas.id });
    claimed = inserted[0];
  } catch (err) {
    return {
      ok: false,
      canal,
      code: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!claimed) {
    return { ok: false, canal, code: "claim_lost" };
  }

  // Enviar
  let providerId: string | null = null;
  let sendErr: { permanente: boolean; detail: string } | null = null;

  if (canal === "whatsapp") {
    const r = await sendWhatsApp({
      to: input.destinatarioTelefono!,
      text: input.waText,
    });
    if (r.ok) {
      providerId = r.providerId;
    } else {
      sendErr = clasificarErrorWa(r);
    }
  } else {
    try {
      const r = await sendEmail(input.emailPayload);
      if (r.ok) {
        providerId = r.providerId;
      } else {
        sendErr = {
          // Heurística mínima: errores con errorName conocido = permanente.
          permanente: r.errorName === "validation_error" ||
            r.errorName === "invalid_email" ||
            r.errorName === "invalid_to_address" ||
            r.errorName === "invalid_from_address" ||
            r.errorName === "missing_required_field",
          detail: r.error,
        };
      }
    } catch (err) {
      sendErr = {
        permanente: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Persistir resultado
  if (!sendErr) {
    try {
      await db
        .update(notificacionesEnviadas)
        .set({ proveedorId: providerId })
        .where(eq(notificacionesEnviadas.id, claimed.id));
    } catch (err) {
      // No crítico — el lock ya está.
      console.warn(
        `[notif] no se pudo persistir proveedorId (${input.tipo}, ${canal}, ${input.turnoId}):`,
        err instanceof Error ? err.message : err
      );
    }
    return { ok: true, canal, providerId };
  }

  if (sendErr.permanente) {
    try {
      await db
        .update(notificacionesEnviadas)
        .set({ error: sendErr.detail })
        .where(eq(notificacionesEnviadas.id, claimed.id));
    } catch (err) {
      console.warn(
        `[notif] no se pudo persistir error permanente (${input.tipo}, ${canal}, ${input.turnoId}):`,
        err instanceof Error ? err.message : err
      );
    }
    return {
      ok: false,
      canal,
      code: "send_failed_permanente",
      detail: sendErr.detail,
    };
  }

  // Transitorio: liberar lock
  try {
    await db
      .delete(notificacionesEnviadas)
      .where(eq(notificacionesEnviadas.id, claimed.id));
  } catch (err) {
    console.warn(
      `[notif] no se pudo liberar lock tras error transitorio (${input.tipo}, ${canal}, ${input.turnoId}):`,
      err instanceof Error ? err.message : err
    );
  }
  return {
    ok: false,
    canal,
    code: "send_failed_transitorio",
    detail: sendErr.detail,
  };
}

/**
 * Decide canal preferido para un destinatario.
 * - Hay teléfono normalizable Y bot configurado → whatsapp.
 * - Caso contrario → email.
 */
export function elegirCanal(telefono: string | null): Canal {
  const botConfigured = ((process.env.WHATSAPP_BOT_URL ?? "").trim()).length > 0;
  if (!botConfigured) return "email";
  if (!telefono || telefono.trim().length === 0) return "email";
  // Si el teléfono no se puede normalizar a E.164, no podemos mandar WA.
  const norm = telefono.startsWith("+")
    ? telefono
    : normalizarTelefonoAR(telefono);
  if (!norm) return "email";
  return "whatsapp";
}

/**
 * Normaliza teléfono a E.164 sin '+' (formato que espera el bot Baileys).
 * Devuelve null si no se puede normalizar.
 */
export function telefonoParaWa(telefono: string | null): string | null {
  if (!telefono) return null;
  const raw = telefono.trim();
  if (!raw) return null;
  const norm = raw.startsWith("+") ? raw : normalizarTelefonoAR(raw);
  if (!norm) return null;
  return norm.replace(/^\+/, "");
}

function clasificarErrorWa(r: SendWaResult): {
  permanente: boolean;
  detail: string;
} {
  if (r.ok) {
    // unreachable, narrowing
    return { permanente: false, detail: "" };
  }
  // Errores permanentes:
  //   - invalid_phone: número malformado, no se va a arreglar reintentando.
  //   - send_failed_permanente: el bot reportó 4xx no recuperable.
  // Errores transitorios:
  //   - bot_unavailable, bot_not_ready, no_bot_url, send_failed_transitorio.
  const permanentes = new Set([
    "invalid_phone",
    "send_failed_permanente",
  ]);
  return {
    permanente: permanentes.has(r.code),
    detail: `${r.code}${r.detail ? `: ${r.detail}` : ""}`,
  };
}
