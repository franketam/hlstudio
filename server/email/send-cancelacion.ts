import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { barberos, clientes, servicios, turnos } from "@/db/schema";
import { env } from "@/lib/env";
import { renderCancelacionCliente } from "./templates/cancelacion-cliente";
import { renderCancelacionBarbero } from "./templates/cancelacion-barbero";
import {
  renderCancelacionClienteWa,
  renderCancelacionBarberoWa,
} from "@/server/whatsapp/templates";
import {
  dispatchNotificacion,
  telefonoParaWa,
} from "@/server/notif/dispatch";

/**
 * Envía las notificaciones de cancelación cuando el admin cancela un turno:
 *   - cliente: aviso de turno cancelado con link para reservar otro
 *   - barbero: aviso de turno cancelado con datos del cliente
 *
 * Mismas reglas que `sendConfirmacionEmails`:
 *   - Cliente: estrategia "both" (WA + email en paralelo si ambos disponibles).
 *   - Barbero: estrategia "both" (WA + email en paralelo si ambos disponibles).
 *   - Idempotencia por (turno_id, tipo, canal) — `cancelacion_cliente` y
 *     `cancelacion_barbero` no chocan con tipos previos.
 *
 * Nunca tira: cualquier excepción queda logueada y no rompe el flow del admin.
 */
export async function sendCancelacionNotifs(turnoId: string): Promise<void> {
  try {
    const ctx = await loadTurnoContext(turnoId);
    if (!ctx) {
      console.warn(`[notif] turno no encontrado: ${turnoId}`);
      return;
    }

    const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const reservarUrl = `${baseUrl}/reservar`;
    const adminUrl = `${baseUrl}/admin/agenda`;

    // -- Cliente --
    if (ctx.clienteEmail || ctx.clienteTelefono) {
      const emailRendered = ctx.clienteEmail
        ? renderCancelacionCliente({
            clienteNombre: ctx.clienteNombre,
            barberoNombre: ctx.barberoNombre,
            servicioNombre: ctx.servicioNombre,
            inicio: ctx.inicio,
            reservarUrl,
          })
        : null;

      const waText = renderCancelacionClienteWa({
        clienteNombre: ctx.clienteNombre,
        barberoNombre: ctx.barberoNombre,
        servicioNombre: ctx.servicioNombre,
        inicio: ctx.inicio,
        reservarUrl,
      });

      const results = await dispatchNotificacion(
        db,
        {
          turnoId,
          tipo: "cancelacion_cliente",
          destinatarioTelefono: telefonoParaWa(ctx.clienteTelefono),
          destinatarioEmail: ctx.clienteEmail,
          waText,
          emailPayload: {
            to: ctx.clienteEmail ?? "",
            subject: emailRendered?.subject ?? "",
            html: emailRendered?.html ?? "",
            text: emailRendered?.text,
          },
        },
        "both"
      );

      for (const r of results) {
        logDispatchResult("cancelacion_cliente", turnoId, r);
      }
    }

    // -- Barbero --
    if (ctx.barberoEmail || ctx.barberoTelefono) {
      const emailRendered = ctx.barberoEmail
        ? renderCancelacionBarbero({
            barberoNombre: ctx.barberoNombre,
            clienteNombre: ctx.clienteNombre,
            clienteTelefono: ctx.clienteTelefono,
            servicioNombre: ctx.servicioNombre,
            inicio: ctx.inicio,
            adminUrl,
          })
        : null;

      const waText = renderCancelacionBarberoWa({
        barberoNombre: ctx.barberoNombre,
        clienteNombre: ctx.clienteNombre,
        clienteTelefono: ctx.clienteTelefono,
        servicioNombre: ctx.servicioNombre,
        inicio: ctx.inicio,
      });

      // Barbero: estrategia "both" — WA + email en paralelo si ambos están
      // disponibles, así el aviso llega aunque WhatsApp quede colgado.
      const results = await dispatchNotificacion(
        db,
        {
          turnoId,
          tipo: "cancelacion_barbero",
          destinatarioTelefono: telefonoParaWa(ctx.barberoTelefono),
          destinatarioEmail: ctx.barberoEmail,
          waText,
          emailPayload: {
            to: ctx.barberoEmail ?? "",
            subject: emailRendered?.subject ?? "",
            html: emailRendered?.html ?? "",
            text: emailRendered?.text,
          },
        },
        "both"
      );

      for (const r of results) {
        logDispatchResult("cancelacion_barbero", turnoId, r);
      }
    }
  } catch (err) {
    console.error("[notif.sendCancelacionNotifs] error fatal", err);
  }
}

type TurnoCtx = {
  inicio: Date;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string | null;
  barberoNombre: string;
  barberoEmail: string | null;
  barberoTelefono: string | null;
  servicioNombre: string;
};

async function loadTurnoContext(turnoId: string): Promise<TurnoCtx | null> {
  const [row] = await db
    .select({
      inicio: turnos.inicioTs,
      clienteNombre: clientes.nombre,
      clienteTelefono: clientes.telefono,
      clienteEmail: clientes.email,
      barberoNombre: barberos.nombre,
      barberoEmail: barberos.email,
      barberoTelefono: barberos.telefono,
      servicioNombre: servicios.nombre,
    })
    .from(turnos)
    .innerJoin(clientes, eq(clientes.id, turnos.clienteId))
    .innerJoin(barberos, eq(barberos.id, turnos.barberoId))
    .innerJoin(servicios, eq(servicios.id, turnos.servicioId))
    .where(eq(turnos.id, turnoId))
    .limit(1);

  return row ?? null;
}

function logDispatchResult(
  tipo: string,
  turnoId: string,
  r: Awaited<ReturnType<typeof dispatchNotificacion>>[number]
): void {
  if (r.ok) {
    console.log(
      `[notif] ${tipo} enviado via ${r.canal} turnoId=${turnoId} providerId=${r.providerId ?? "n/a"}`
    );
    return;
  }
  if (r.code === "skipped_sin_destinatario") {
    console.warn(
      `[notif] ${tipo} skip: sin destinatario para ${r.canal} turnoId=${turnoId}`
    );
    return;
  }
  if (r.code === "claim_lost") {
    console.log(
      `[notif] ${tipo} ya enviado por otro proceso (canal=${r.canal}) turnoId=${turnoId}`
    );
    return;
  }
  console.error(
    `[notif] ${tipo} fallo (canal=${r.canal}, code=${r.code}) turnoId=${turnoId}: ${r.detail ?? ""}`
  );
}
