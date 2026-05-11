import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  barberos,
  clientes,
  notificacionesEnviadas,
  servicios,
  turnos,
} from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail } from "./client";
import { renderConfirmacionCliente } from "./templates/confirmacion-cliente";
import { renderNotificacionBarbero } from "./templates/notificacion-barbero";

/**
 * Envía los emails de confirmación al crear un turno:
 *   - cliente: confirmación de su reserva con link único de cancelación
 *   - barbero: notificación de nueva reserva con datos de contacto
 *
 * Idempotencia: por (turno_id, tipo) en `notificaciones_enviadas`.
 *   - Si ya hay registro, no reintenta (evita doble envío si se llama varias veces).
 *   - Si Resend falla, igual deja el registro con `error` para poder reintentar manual.
 *
 * Robustez: cualquier error es capturado y logueado. Esta función nunca tira —
 * el booking ya fue creado y no debe romper por una falla de email.
 */
export async function sendConfirmacionEmails(turnoId: string): Promise<void> {
  try {
    const ctx = await loadTurnoContext(turnoId);
    if (!ctx) {
      console.warn(`[email] turno no encontrado: ${turnoId}`);
      return;
    }

    await Promise.all([
      // Solo si el cliente tiene email cargado. Walk-ins admin pueden no tenerlo.
      ctx.clienteEmail
        ? sendOnce(turnoId, "confirmacion_cliente", () =>
            enviarConfirmacionCliente(ctx as TurnoCtx & { clienteEmail: string })
          )
        : Promise.resolve(),
      // Solo si el barbero tiene email cargado.
      ctx.barberoEmail
        ? sendOnce(turnoId, "confirmacion_barbero", () =>
            enviarNotificacionBarbero(ctx)
          )
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.error("[email.sendConfirmacionEmails] error fatal", err);
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

async function enviarConfirmacionCliente(
  ctx: TurnoCtx & { clienteEmail: string }
) {
  const cancelUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/turno/${ctx.cancelToken}`;
  const rendered = renderConfirmacionCliente({
    clienteNombre: ctx.clienteNombre,
    barberoNombre: ctx.barberoNombre,
    servicioNombre: ctx.servicioNombre,
    inicio: ctx.inicio,
    duracionMin: ctx.servicioDuracionMin,
    precioTotal: ctx.precioTotal,
    cancelUrl,
  });

  return sendEmail({
    to: ctx.clienteEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

async function enviarNotificacionBarbero(ctx: TurnoCtx) {
  if (!ctx.barberoEmail) {
    return { ok: false as const, error: "barbero_sin_email" };
  }
  const adminUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/agenda`;
  const rendered = renderNotificacionBarbero({
    barberoNombre: ctx.barberoNombre,
    clienteNombre: ctx.clienteNombre,
    clienteTelefono: ctx.clienteTelefono,
    clienteEmail: ctx.clienteEmail ?? "",
    servicioNombre: ctx.servicioNombre,
    inicio: ctx.inicio,
    duracionMin: ctx.servicioDuracionMin,
    precioTotal: ctx.precioTotal,
    adminUrl,
  });

  return sendEmail({
    to: ctx.barberoEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // reply-to solo si hay email — sino el barbero respondería a vacío.
    ...(ctx.clienteEmail ? { replyTo: ctx.clienteEmail } : {}),
  });
}

/**
 * Idempotencia: si ya hay registro (turnoId, tipo), skip.
 * Sino, envía y guarda el resultado (proveedor_id en éxito, error en fallo).
 */
async function sendOnce(
  turnoId: string,
  tipo: "confirmacion_cliente" | "confirmacion_barbero",
  send: () => Promise<{ ok: true; providerId: string | null } | { ok: false; error: string }>
): Promise<void> {
  const yaEnviadas = await db
    .select({ tipo: notificacionesEnviadas.tipo })
    .from(notificacionesEnviadas)
    .where(eq(notificacionesEnviadas.turnoId, turnoId));

  if (yaEnviadas.some((r) => r.tipo === tipo)) {
    return;
  }

  let result: { ok: true; providerId: string | null } | { ok: false; error: string };
  try {
    result = await send();
  } catch (err) {
    result = {
      ok: false,
      error: `exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    await db.insert(notificacionesEnviadas).values({
      turnoId,
      tipo,
      proveedorId: result.ok ? result.providerId : null,
      error: result.ok ? null : result.error,
    });
  } catch (err) {
    // Si dos invocaciones simultáneas chocan en el unique constraint, no es problema.
    console.warn(
      `[email] no se pudo registrar notificacion (${tipo}, ${turnoId}):`,
      err instanceof Error ? err.message : err
    );
  }

  if (!result.ok) {
    console.error(
      `[email] envío fallido (${tipo}, ${turnoId}): ${result.error}`
    );
  }
}
