"use server";

import { z } from "zod";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  barberos,
  clientes,
  preciosBarberoServicio,
  servicios,
  turnos,
} from "@/db/schema";
import { buildCancelToken, verifyCancelToken } from "@/lib/cancel-token";
import { normalizarTelefonoAR } from "@/lib/phone";
import { rangesOverlap, barberoBloqueadoRecurrente } from "@/lib/availability";
import {
  RATE_LIMITS,
  checkRateLimitForRoute,
} from "@/lib/rate-limit";
import { sendConfirmacionEmails } from "@/server/email/send-confirmacion";
import { sendCancelacionNotifs } from "@/server/email/send-cancelacion";

/**
 * Resultado tipado, mismo shape que el resto del proyecto.
 */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const createTurnoSchema = z.object({
  barberoId: z.string().uuid("Barbero inválido."),
  servicioId: z.string().uuid("Servicio inválido."),
  inicioIso: z.string().min(10, "Fecha/hora inválida."),
  cliente: z.object({
    nombre: z.string().trim().min(2, "Ingresá tu nombre completo."),
    telefono: z.string().trim().min(6, "Ingresá un teléfono válido."),
    email: z.string().trim().email("Ingresá un email válido."),
  }),
});

export type CreateTurnoInput = z.infer<typeof createTurnoSchema>;

export type CreateTurnoOk = {
  turnoId: string;
  cancelToken: string;
};

const VENTANA_CANCEL_HORAS = 3;

// Margen de gracia para clock skew entre cliente / servidor (validación de pasado).
const GRACIA_CLOCK_SKEW_MS = 5 * 60 * 1000;
// Cuota máxima de adelanto: 90 días. Evita reservar en horizontes irreales.
const MAX_ADELANTO_DIAS = 90;

/**
 * Crea un turno con anti-doble-booking server-side.
 *
 * Estrategia:
 *  1. Validar input.
 *  2. Resolver duración del servicio + precio del barbero.
 *  3. Resolver/crear cliente por teléfono normalizado.
 *  4. Transacción serializable que verifica que no haya solapamiento con otro turno
 *     activo del mismo barbero, y si todo OK inserta el turno.
 *  5. Genera cancel_token HMAC y lo guarda.
 */
export async function createTurno(
  input: CreateTurnoInput
): Promise<ActionResult<CreateTurnoOk>> {
  // Rate limit: 5 turnos por IP por hora. Endpoint público, target de abuso.
  const rl = await checkRateLimitForRoute(
    "reservar",
    RATE_LIMITS.CREATE_TURNO.limit,
    RATE_LIMITS.CREATE_TURNO.windowMs
  );
  if (!rl.ok) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Demasiados intentos. Probá en un rato.",
      },
    };
  }

  const parsed = createTurnoSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: first?.message ?? "Datos inválidos.",
      },
    };
  }

  const { barberoId, servicioId, inicioIso, cliente } = parsed.data;

  // 1. Inicio
  const inicio = new Date(inicioIso);
  if (Number.isNaN(inicio.getTime())) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Fecha/hora inválida." },
    };
  }
  // Validación de pasado con 5 min de gracia para clock skew.
  if (inicio.getTime() <= Date.now() - GRACIA_CLOCK_SKEW_MS) {
    return {
      ok: false,
      error: {
        code: "slot_pasado",
        message: "Ese horario ya pasó. Elegí otro.",
      },
    };
  }
  // Sanity: no permitir agendar más de 90 días en el futuro.
  const maxFuturoMs =
    Date.now() + MAX_ADELANTO_DIAS * 24 * 60 * 60 * 1000;
  if (inicio.getTime() > maxFuturoMs) {
    return {
      ok: false,
      error: {
        code: "slot_demasiado_lejos",
        message: `No se puede reservar con más de ${MAX_ADELANTO_DIAS} días de anticipación.`,
      },
    };
  }

  // 2. Barbero activo
  const [b] = await db
    .select({ id: barberos.id, activo: barberos.activo })
    .from(barberos)
    .where(eq(barberos.id, barberoId))
    .limit(1);
  if (!b || !b.activo) {
    return {
      ok: false,
      error: { code: "barbero_invalido", message: "Barbero no disponible." },
    };
  }

  // 3. Servicio activo + duración
  const [s] = await db
    .select({
      id: servicios.id,
      activo: servicios.activo,
      duracionMin: servicios.duracionMin,
    })
    .from(servicios)
    .where(eq(servicios.id, servicioId))
    .limit(1);
  if (!s || !s.activo) {
    return {
      ok: false,
      error: { code: "servicio_invalido", message: "Servicio no disponible." },
    };
  }

  const fin = new Date(inicio.getTime() + s.duracionMin * 60_000);

  // 3.b Bloqueo recurrente del barbero (ej. no atiende los martes a la tarde).
  // Defensa server-side: getAvailableSlots ya no ofrece estos slots, pero un
  // cliente que mande un inicioIso a mano no debe poder colarse.
  if (await barberoBloqueadoRecurrente(barberoId, inicio, fin)) {
    return {
      ok: false,
      error: {
        code: "barbero_bloqueado",
        message: "Ese horario no está disponible con ese barbero. Elegí otro.",
      },
    };
  }

  // 4. Precio del barbero para ese servicio (snapshot)
  const [precioRow] = await db
    .select({ precio: preciosBarberoServicio.precio })
    .from(preciosBarberoServicio)
    .where(
      and(
        eq(preciosBarberoServicio.barberoId, barberoId),
        eq(preciosBarberoServicio.servicioId, servicioId)
      )
    )
    .limit(1);
  if (!precioRow) {
    return {
      ok: false,
      error: {
        code: "precio_no_definido",
        message: "Ese servicio no está disponible con ese barbero.",
      },
    };
  }

  // 5. Cliente: normalizar teléfono, buscar por teléfono, crear si no existe.
  const telefonoNorm =
    normalizarTelefonoAR(cliente.telefono) ?? cliente.telefono.trim();

  let clienteId: string;
  const [existing] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.telefono, telefonoNorm))
    .limit(1);

  if (existing) {
    clienteId = existing.id;
    // Update best-effort de nombre/email si difieren.
    await db
      .update(clientes)
      .set({
        nombre: cliente.nombre,
        email: cliente.email,
        updatedAt: new Date(),
      })
      .where(eq(clientes.id, clienteId));
  } else {
    const [created] = await db
      .insert(clientes)
      .values({
        nombre: cliente.nombre,
        telefono: telefonoNorm,
        email: cliente.email,
      })
      .returning({ id: clientes.id });
    if (!created) {
      return {
        ok: false,
        error: {
          code: "cliente_no_creado",
          message: "No pudimos guardar tus datos. Probá de nuevo.",
        },
      };
    }
    clienteId = created.id;
  }

  // 6. Transacción: chequear solapamiento + insert.
  // Usamos isolation level serializable; ante conflicto reintentamos 1 vez.
  let resultado: { id: string } | null = null;
  let conflicto = false;

  try {
    await db.transaction(
      async (tx) => {
        // Buscar cualquier turno activo del barbero que solape con [inicio, fin).
        const conflictos = await tx
          .select({
            id: turnos.id,
            inicioTs: turnos.inicioTs,
            finTs: turnos.finTs,
          })
          .from(turnos)
          .where(
            and(
              eq(turnos.barberoId, barberoId),
              eq(turnos.estado, "confirmado"),
              // overlap: inicioTs < fin AND finTs > inicio
              lt(turnos.inicioTs, fin),
              gt(turnos.finTs, inicio)
            )
          );

        const haySolape = conflictos.some((c) =>
          rangesOverlap(inicio, fin, c.inicioTs, c.finTs)
        );

        if (haySolape) {
          conflicto = true;
          // Forzamos rollback con un throw controlado.
          throw new Error("__SLOT_OCUPADO__");
        }

        // Insert con cancel_token placeholder; luego lo updateamos con el HMAC del id real.
        const [row] = await tx
          .insert(turnos)
          .values({
            clienteId,
            barberoId,
            servicioId,
            inicioTs: inicio,
            finTs: fin,
            estado: "confirmado",
            precioTotal: precioRow.precio,
            cancelToken: "pending",
          })
          .returning({ id: turnos.id });

        if (!row) {
          throw new Error("Insert turno devolvió 0 filas");
        }

        const token = buildCancelToken(row.id, inicio);

        await tx
          .update(turnos)
          .set({ cancelToken: token })
          .where(eq(turnos.id, row.id));

        resultado = { id: row.id };
      },
      { isolationLevel: "serializable" }
    );
  } catch (err) {
    if (conflicto) {
      return {
        ok: false,
        error: {
          code: "slot_ocupado",
          message:
            "Ese horario acaba de ser tomado. Elegí otro.",
        },
      };
    }
    console.error("[booking.createTurno] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos confirmar el turno. Probá de nuevo.",
      },
    };
  }

  if (!resultado) {
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos confirmar el turno. Probá de nuevo.",
      },
    };
  }

  const turnoId = (resultado as { id: string }).id;
  const token = buildCancelToken(turnoId, inicio);

  // Disparar emails de confirmación (cliente + barbero) sin bloquear la respuesta.
  // sendConfirmacionEmails captura sus propios errores y registra el resultado
  // en `notificaciones_enviadas`. No debe afectar el flujo de booking.
  void sendConfirmacionEmails(turnoId);

  return {
    ok: true,
    data: { turnoId, cancelToken: token },
  };
}

/**
 * Cancela un turno usando el cancel_token.
 * Reglas:
 *  - Token HMAC válido.
 *  - Estado actual = "confirmado" (no se puede cancelar dos veces).
 *  - Falta más de VENTANA_CANCEL_HORAS al inicio.
 */
export async function cancelTurno(
  token: string
): Promise<ActionResult<{ turnoId: string }>> {
  // Rate limit: 20 cancelaciones por IP por hora. Limita fuzzing del token.
  const rl = await checkRateLimitForRoute(
    "cancelar",
    RATE_LIMITS.CANCEL_TURNO.limit,
    RATE_LIMITS.CANCEL_TURNO.windowMs
  );
  if (!rl.ok) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Demasiados intentos. Probá en un rato.",
      },
    };
  }

  const parsed = verifyCancelToken(token);
  if (!parsed) {
    console.warn("[security] cancel_token_invalido");
    return {
      ok: false,
      error: { code: "token_invalido", message: "Link inválido o vencido." },
    };
  }

  const [row] = await db
    .select({
      id: turnos.id,
      inicioTs: turnos.inicioTs,
      estado: turnos.estado,
    })
    .from(turnos)
    .where(eq(turnos.id, parsed.turnoId))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Turno no encontrado." },
    };
  }

  if (row.estado !== "confirmado") {
    return {
      ok: false,
      error: {
        code: "estado_invalido",
        message: "Este turno ya no está activo.",
      },
    };
  }

  const ventanaMs = VENTANA_CANCEL_HORAS * 60 * 60 * 1000;
  if (row.inicioTs.getTime() - Date.now() < ventanaMs) {
    return {
      ok: false,
      error: {
        code: "fuera_de_ventana",
        message:
          "No podés cancelar online con menos de 3 horas. Comunicate con el barbero.",
      },
    };
  }

  await db
    .update(turnos)
    .set({ estado: "cancelado_cliente", updatedAt: new Date() })
    .where(eq(turnos.id, row.id));

  // Aviso a cliente y barbero. Fire-and-forget: ya cancelamos en BD, una falla
  // de notif no debe romper el flujo del cliente. `sendCancelacionNotifs` captura
  // todo y manda al barbero por WhatsApp Y email en paralelo (estrategia "both").
  void sendCancelacionNotifs(row.id);

  return { ok: true, data: { turnoId: row.id } };
}
