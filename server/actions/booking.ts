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
import { getRequestInfo } from "@/lib/request-info";
import {
  chequearBloqueos,
  chequearLimitesCliente,
} from "@/server/actions/anti-abuso";
import { checkWhatsAppExists } from "@/server/whatsapp/client";
import { alertarReservaRechazada } from "@/server/whatsapp/alertas";
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

/**
 * Error único para todo rechazo por validación del teléfono.
 *
 * A propósito NO distingue "no tiene WhatsApp" de "formato inválido": decirle
 * al que intenta reservar cuál de las dos validaciones falló es explicarle qué
 * tiene que cambiar para pasar. El detalle va por WhatsApp al dueño
 * (`alertarReservaRechazada`), que es quien necesita saberlo.
 *
 * Contrapartida asumida: el cliente legítimo que se equivoca tipeando tampoco
 * recibe la pista. El mensaje lo empuja a escribir por WhatsApp o pasar por el
 * local, que es la salida que le queda.
 */
const ERROR_RESERVA_RECHAZADA = {
  code: "reserva_rechazada",
  message:
    "No pudimos confirmar el turno con esos datos. Revisalos y probá de nuevo, o escribinos por WhatsApp.",
} as const;

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

  // Origen del request. Se resuelve temprano porque lo necesitan tanto el turno
  // creado como los logs de los intentos rechazados — sobre todo esos, que son
  // los que no dejan ninguna otra huella.
  const req = await getRequestInfo();
  const origenLog = `ip=${req.ip} navegador="${req.navegador}"${req.sospechoso ? " sospechoso=si" : ""}`;

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
  //
  // En el flow público exigimos que el teléfono normalice a E.164. El flow
  // admin conserva el fallback laxo (walk-in con un número raro que el dueño
  // anotó a mano). Se corta acá, antes de crear el cliente: un intento
  // rechazado no debe dejar filas atrás.
  const telefonoNorm = normalizarTelefonoAR(cliente.telefono);
  if (!telefonoNorm) {
    console.warn(
      `[security] telefono_invalido tel=${cliente.telefono} ${origenLog}`
    );
    alertarReservaRechazada({
      telefonoIngresado: cliente.telefono,
      nombreIngresado: cliente.nombre,
      motivo: "telefono_invalido",
    });
    return { ok: false, error: ERROR_RESERVA_RECHAZADA };
  }

  // 5.a Lista negra. Va antes del chequeo de WhatsApp a propósito: si el
  // identificador está bloqueado no hay razón para gastar una consulta al
  // directorio ni para crear nada.
  const bloqueo = await chequearBloqueos({
    ip: req.ip,
    email: cliente.email,
    telefono: telefonoNorm,
  });
  if (!bloqueo.permitido) {
    console.warn(
      `[security] intento_de_bloqueado motivo=${bloqueo.motivo} ${bloqueo.detalle} ${origenLog}`
    );
    // Sí vale avisarle al dueño: significa que el que bloqueó volvió a probar.
    // El throttle de 10 min impide que se convierta en inundación.
    alertarReservaRechazada({
      telefonoIngresado: cliente.telefono,
      nombreIngresado: cliente.nombre,
      motivo: "bloqueado",
    });
    return { ok: false, error: ERROR_RESERVA_RECHAZADA };
  }

  let clienteId: string;
  const [existing] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.telefono, telefonoNorm))
    .limit(1);

  // 5.a.bis Límites por cliente: tope de turnos activos y un solo turno por
  // franja. No se le avisa al dueño — el que topea suele ser un cliente real
  // pasándose de la raya, no un ataque, y alertarlo sería ruido.
  const limites = await chequearLimitesCliente(existing?.id ?? null, inicio, fin);
  if (!limites.permitido) {
    console.warn(
      `[security] limite_cliente motivo=${limites.motivo} ${limites.detalle} ${origenLog}`
    );
    return { ok: false, error: ERROR_RESERVA_RECHAZADA };
  }

  // 5.b Validar que el número tenga cuenta de WhatsApp.
  //
  // Es por donde salen la confirmación y el recordatorio, así que un número sin
  // WhatsApp es un turno que nadie va a poder confirmar — y es también el filtro
  // más barato contra los turnos falsos, porque un número inventado no tiene
  // cuenta. Cero fricción: es una consulta al directorio, no se manda nada.
  //
  // Solo para clientes nuevos. Al que ya reservó alguna vez no tiene sentido
  // re-validarlo, y el caso "se equivocó al tipear" queda igual cubierto: un
  // número mal tipeado no está en la base, así que entra por acá.
  //
  // Solo rechazamos con un `false` explícito. Si el chequeo queda indeterminado
  // —bot caído, sin parear, timeout— dejamos pasar: esto es una validación de
  // tipeo, y convertir cualquier hipo del bot en una caída del formulario de
  // reservas cuesta mucho más caro que dejar entrar un turno falso.
  if (!existing) {
    const wa = await checkWhatsAppExists(telefonoNorm);
    if (wa.exists === false) {
      console.warn(
        `[security] telefono_sin_whatsapp tel=${telefonoNorm} detalle=${wa.detail ?? "-"} ${origenLog}`
      );
      alertarReservaRechazada({
        telefonoIngresado: cliente.telefono,
        nombreIngresado: cliente.nombre,
        motivo: "sin_whatsapp",
      });
      return { ok: false, error: ERROR_RESERVA_RECHAZADA };
    }
    if (wa.exists === null) {
      // No es un error del usuario, pero conviene verlo en los logs: si esto
      // aparece seguido, la validación está apagada de hecho y hay que mirar
      // el bot.
      console.warn(
        `[security] chequeo_whatsapp_indeterminado tel=${telefonoNorm} detalle=${wa.detail ?? "-"}`
      );
    }
  }

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
            creadoIp: req.ip,
            creadoUserAgent: req.userAgent,
            origen: "publico",
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

  // Un renglón por turno creado. Duplica lo que ya queda en la fila de `turnos`
  // a propósito: los logs se leen en Coolify sin abrir la base, y sirven para
  // correlacionar un turno con los intentos rechazados que lo rodean.
  console.info(
    `[turno] creado turnoId=${turnoId} origen=publico tel=${telefonoNorm} inicio=${inicio.toISOString()} ${origenLog}`
  );

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
