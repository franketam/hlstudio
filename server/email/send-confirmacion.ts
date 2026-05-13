import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { barberos, clientes, servicios, turnos } from "@/db/schema";
import { env } from "@/lib/env";
import { renderConfirmacionCliente } from "./templates/confirmacion-cliente";
import { renderNotificacionBarbero } from "./templates/notificacion-barbero";
import {
  renderConfirmacionClienteWa,
  renderConfirmacionBarberoWa,
} from "@/server/whatsapp/templates";
import {
  dispatchNotificacion,
  telefonoParaWa,
} from "@/server/notif/dispatch";

/**
 * Envía las notificaciones de confirmación al crear un turno:
 *   - cliente: confirmación de su reserva con link único de cancelación
 *   - barbero: notificación de nueva reserva con datos de contacto
 *
 * Canal: WhatsApp si el destinatario tiene teléfono cargado y el bot está
 * configurado; sino email. Ver `server/notif/dispatch.ts`.
 *
 * Idempotencia: por (turno_id, tipo, canal) en `notificaciones_enviadas`.
 *
 * Robustez: cualquier error es capturado y logueado. Esta función nunca tira —
 * el booking ya fue creado y no debe romper por una falla de envío.
 *
 * Nombre histórico (`sendConfirmacionEmails`) se mantiene para no tocar callers,
 * aunque hoy puede mandar WA.
 */
export async function sendConfirmacionEmails(turnoId: string): Promise<void> {
  try {
    const ctx = await loadTurnoContext(turnoId);
    if (!ctx) {
      console.warn(`[notif] turno no encontrado: ${turnoId}`);
      return;
    }

    const cancelUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/turno/${ctx.cancelToken}`;
    const adminUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/agenda`;

    // -- Cliente --
    if (ctx.clienteEmail || ctx.clienteTelefono) {
      const emailRendered = ctx.clienteEmail
        ? renderConfirmacionCliente({
            clienteNombre: ctx.clienteNombre,
            barberoNombre: ctx.barberoNombre,
            servicioNombre: ctx.servicioNombre,
            inicio: ctx.inicio,
            duracionMin: ctx.servicioDuracionMin,
            precioTotal: ctx.precioTotal,
            cancelUrl,
          })
        : null;

      const waText = renderConfirmacionClienteWa({
        clienteNombre: ctx.clienteNombre,
        barberoNombre: ctx.barberoNombre,
        servicioNombre: ctx.servicioNombre,
        inicio: ctx.inicio,
        duracionMin: ctx.servicioDuracionMin,
        precioTotal: ctx.precioTotal,
        cancelUrl,
      });

      const r = await dispatchNotificacion(db, {
        turnoId,
        tipo: "confirmacion_cliente",
        destinatarioTelefono: telefonoParaWa(ctx.clienteTelefono),
        destinatarioEmail: ctx.clienteEmail,
        waText,
        emailPayload: {
          to: ctx.clienteEmail ?? "",
          subject: emailRendered?.subject ?? "",
          html: emailRendered?.html ?? "",
          text: emailRendered?.text,
        },
      });

      logDispatchResult("confirmacion_cliente", turnoId, r);
    }

    // -- Barbero --
    // Solo si tiene email o teléfono cargado. Si null en ambos → barbero no
    // recibe notificación.
    if (ctx.barberoEmail || ctx.barberoTelefono) {
      const emailRendered = ctx.barberoEmail
        ? renderNotificacionBarbero({
            barberoNombre: ctx.barberoNombre,
            clienteNombre: ctx.clienteNombre,
            clienteTelefono: ctx.clienteTelefono,
            clienteEmail: ctx.clienteEmail ?? "",
            servicioNombre: ctx.servicioNombre,
            inicio: ctx.inicio,
            duracionMin: ctx.servicioDuracionMin,
            precioTotal: ctx.precioTotal,
            adminUrl,
          })
        : null;

      const waText = renderConfirmacionBarberoWa({
        barberoNombre: ctx.barberoNombre,
        clienteNombre: ctx.clienteNombre,
        clienteTelefono: ctx.clienteTelefono,
        servicioNombre: ctx.servicioNombre,
        inicio: ctx.inicio,
        duracionMin: ctx.servicioDuracionMin,
        precioTotal: ctx.precioTotal,
      });

      const r = await dispatchNotificacion(db, {
        turnoId,
        tipo: "confirmacion_barbero",
        destinatarioTelefono: telefonoParaWa(ctx.barberoTelefono),
        destinatarioEmail: ctx.barberoEmail,
        waText,
        emailPayload: {
          to: ctx.barberoEmail ?? "",
          subject: emailRendered?.subject ?? "",
          html: emailRendered?.html ?? "",
          text: emailRendered?.text,
          ...(ctx.clienteEmail ? { replyTo: ctx.clienteEmail } : {}),
        },
      });

      logDispatchResult("confirmacion_barbero", turnoId, r);
    }
  } catch (err) {
    console.error("[notif.sendConfirmacionEmails] error fatal", err);
  }
}

type TurnoCtx = {
  turnoId: string;
  inicio: Date;
  precioTotal: string;
  cancelToken: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string | null;
  barberoNombre: string;
  barberoEmail: string | null;
  barberoTelefono: string | null;
  servicioNombre: string;
  servicioDuracionMin: number;
};

async function loadTurnoContext(turnoId: string): Promise<TurnoCtx | null> {
  const [row] = await db
    .select({
      turnoId: turnos.id,
      inicio: turnos.inicioTs,
      precioTotal: turnos.precioTotal,
      cancelToken: turnos.cancelToken,
      clienteNombre: clientes.nombre,
      clienteTelefono: clientes.telefono,
      clienteEmail: clientes.email,
      barberoNombre: barberos.nombre,
      barberoEmail: barberos.email,
      barberoTelefono: barberos.telefono,
      servicioNombre: servicios.nombre,
      servicioDuracionMin: servicios.duracionMin,
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
  r: Awaited<ReturnType<typeof dispatchNotificacion>>
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
