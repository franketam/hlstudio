"use server";

import { z } from "zod";
import { and, eq, gt, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  barberos,
  clientes,
  preciosBarberoServicio,
  servicios,
  turnos,
} from "@/db/schema";
import { buildCancelToken } from "@/lib/cancel-token";
import { normalizarTelefonoAR } from "@/lib/phone";
import {
  getAvailableSlots,
  rangesOverlap,
  barberoBloqueadoRecurrente,
} from "@/lib/availability";
import { getSession } from "@/lib/session";
import { ymdLocal } from "@/lib/format";
import {
  bloquearIdentificadores,
  type NuevoBloqueo,
} from "@/server/actions/anti-abuso";
import { sendConfirmacionEmails } from "@/server/email/send-confirmacion";
import { sendCancelacionNotifs } from "@/server/email/send-cancelacion";

/**
 * Server actions del panel admin para `/admin/agenda`.
 *
 * Crear turno manual (RF-12) — casos de uso:
 *   - Walk-in retroactivo: el cliente vino al local sin reserva, el dueño lo
 *     carga después para que entre en el historial.
 *   - Reserva tomada por teléfono / WhatsApp / DM por el dueño.
 *
 * Diferencias clave vs el flow público (`server/actions/booking.ts`):
 *   - Requiere sesión admin.
 *   - Email del cliente OPCIONAL.
 *   - Acepta turnos en el pasado (hasta 30 días atrás).
 *   - NO envía email de confirmación al cliente (lo notifica el dueño en
 *     persona / teléfono). Sí avisa al barbero si tiene email cargado y el
 *     turno es futuro (mismo path que el flow público).
 *   - Permite marcar el turno como `pagado_completo` desde el momento de la
 *     creación si el cliente ya pagó en el local.
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type ErrResult = Extract<ActionResult, { ok: false }>;

async function requireSession(): Promise<ErrResult | null> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return {
      ok: false,
      error: { code: "no_autorizado", message: "Sesión requerida." },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. getSlotsAdminAction — refresca slots cuando el admin cambia barbero/servicio/fecha
// ---------------------------------------------------------------------------

const slotsInputSchema = z.object({
  barberoId: z.string().uuid("Barbero inválido."),
  servicioId: z.string().uuid("Servicio inválido."),
  /** "YYYY-MM-DD" en TZ local. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
});

export type GetSlotsAdminInput = z.input<typeof slotsInputSchema>;

export type SlotAdmin = {
  slot: string;
  /** ISO UTC */
  inicioIso: string;
  /** ISO UTC */
  finIso: string;
};

/**
 * Devuelve los slots disponibles para el panel admin. Reusa `getAvailableSlots`
 * del flow público (misma lógica anti-doble-booking en read).
 *
 * Nota: si la fecha es en el pasado, `getAvailableSlots` filtra por
 * `MIN_LEAD_MINUTES` y devolverá [] — esperable, los walk-ins retroactivos
 * no eligen "slot disponible", se insertan directo con el horario que el dueño
 * indique (otro flujo). Para v1 del walk-in: si la fecha es pasada, el admin
 * usa el form completando los datos pero el server confía en lo que mande.
 *
 * Por simplicidad, este endpoint solo sirve para fechas hoy/futuras. Para el
 * caso retroactivo el form pedirá hora libre (sin lista de slots).
 */
export async function getSlotsAdminAction(
  input: GetSlotsAdminInput
): Promise<ActionResult<{ slots: SlotAdmin[] }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = slotsInputSchema.safeParse(input);
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

  try {
    const slots = await getAvailableSlots(parsed.data);
    return {
      ok: true,
      data: {
        slots: slots.map((s) => ({
          slot: s.slot,
          inicioIso: s.inicioTs.toISOString(),
          finIso: s.finTs.toISOString(),
        })),
      },
    };
  } catch (err) {
    console.error("[admin.agenda.getSlots] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos cargar los horarios. Probá de nuevo.",
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 2. lookupClienteAction — busca un cliente existente por teléfono
// ---------------------------------------------------------------------------

const lookupInputSchema = z.object({
  telefono: z.string().trim().min(6, "Teléfono inválido."),
});

export type LookupClienteInput = z.input<typeof lookupInputSchema>;

export type ClienteLookup = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string;
};

/**
 * Lookup de cliente por teléfono normalizado. Devuelve null si no existe
 * (no es error — el dueño completa nombre/email para crearlo).
 */
export async function lookupClienteAction(
  input: LookupClienteInput
): Promise<ActionResult<{ cliente: ClienteLookup | null }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = lookupInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Teléfono inválido." },
    };
  }

  const telefonoNorm =
    normalizarTelefonoAR(parsed.data.telefono) ?? parsed.data.telefono.trim();

  try {
    const [row] = await db
      .select({
        id: clientes.id,
        nombre: clientes.nombre,
        email: clientes.email,
        telefono: clientes.telefono,
      })
      .from(clientes)
      .where(eq(clientes.telefono, telefonoNorm))
      .limit(1);

    return { ok: true, data: { cliente: row ?? null } };
  } catch (err) {
    console.error("[admin.agenda.lookupCliente] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos buscar el cliente. Probá de nuevo.",
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 3. createTurnoAdminAction — crea el turno manual
// ---------------------------------------------------------------------------

const PASADO_MAX_DIAS = 30;

const createInputSchema = z.object({
  barberoId: z.string().uuid("Barbero inválido."),
  servicioId: z.string().uuid("Servicio inválido."),
  inicioIso: z.string().min(10, "Fecha/hora inválida."),
  cliente: z.object({
    nombre: z.string().trim().min(2, "Ingresá el nombre del cliente."),
    telefono: z.string().trim().min(6, "Ingresá un teléfono válido."),
    email: z
      .string()
      .trim()
      .email("Email inválido.")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v && v.length > 0 ? v : null)),
  }),
  pagoEnLocal: z.boolean().default(false),
});

export type CreateTurnoAdminInput = z.input<typeof createInputSchema>;

export type CreateTurnoAdminOk = {
  turnoId: string;
};

export async function createTurnoAdminAction(
  input: CreateTurnoAdminInput
): Promise<ActionResult<CreateTurnoAdminOk>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = createInputSchema.safeParse(input);
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

  const { barberoId, servicioId, inicioIso, cliente, pagoEnLocal } =
    parsed.data;

  // 1. Inicio
  const inicio = new Date(inicioIso);
  if (Number.isNaN(inicio.getTime())) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Fecha/hora inválida." },
    };
  }

  // Sanity: no más de 30 días en el pasado (evita typos catastróficos).
  const limitePasado = new Date(
    Date.now() - PASADO_MAX_DIAS * 24 * 60 * 60 * 1000
  );
  if (inicio < limitePasado) {
    return {
      ok: false,
      error: {
        code: "fecha_demasiado_atras",
        message: `No podés cargar turnos con más de ${PASADO_MAX_DIAS} días de antigüedad.`,
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

  // 3.b Bloqueo recurrente: sólo bloquea turnos futuros. El admin puede cargar
  // walk-ins retroactivos (el barbero efectivamente atendió pese al bloqueo
  // recurrente), pero no debería poder agendar a futuro un horario que marcó
  // como "no atiendo". Si lo necesita, primero borra el bloqueo recurrente.
  if (
    inicio.getTime() > Date.now() &&
    (await barberoBloqueadoRecurrente(barberoId, inicio, fin))
  ) {
    return {
      ok: false,
      error: {
        code: "barbero_bloqueado",
        message:
          "El barbero tiene un bloqueo recurrente en ese horario. Sacalo en Configuración si querés agendar igual.",
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
    // Update best-effort. Solo pisamos email si vino uno nuevo (no queremos
    // borrar el email previo con un walk-in que no lo provee).
    await db
      .update(clientes)
      .set({
        nombre: cliente.nombre,
        ...(cliente.email ? { email: cliente.email } : {}),
        updatedAt: new Date(),
      })
      .where(eq(clientes.id, clienteId));
  } else {
    const [created] = await db
      .insert(clientes)
      .values({
        nombre: cliente.nombre,
        telefono: telefonoNorm,
        email: cliente.email, // puede ser null en walk-in
      })
      .returning({ id: clientes.id });
    if (!created) {
      return {
        ok: false,
        error: {
          code: "cliente_no_creado",
          message: "No pudimos guardar los datos del cliente. Probá de nuevo.",
        },
      };
    }
    clienteId = created.id;
  }

  // 6. Transacción serializable: check anti-doble-booking + insert.
  let resultado: { id: string } | null = null;
  let conflicto = false;

  try {
    await db.transaction(
      async (tx) => {
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
              lt(turnos.inicioTs, fin),
              gt(turnos.finTs, inicio)
            )
          );

        const haySolape = conflictos.some((c) =>
          rangesOverlap(inicio, fin, c.inicioTs, c.finTs)
        );

        if (haySolape) {
          conflicto = true;
          throw new Error("__SLOT_OCUPADO__");
        }

        const estadoPago = pagoEnLocal ? "pagado_completo" : "pendiente_local";

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
            estadoPago,
            cancelToken: "pending",
            // Sin ip/user-agent: lo cargó el dueño desde el panel, no hay un
            // navegador de cliente detrás. `origen` es lo que permite excluir
            // estos turnos de cualquier análisis de abuso del formulario.
            origen: "admin",
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
          message: "Ese horario ya está ocupado. Elegí otro.",
        },
      };
    }
    console.error("[admin.agenda.createTurno] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos crear el turno. Probá de nuevo.",
      },
    };
  }

  if (!resultado) {
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos crear el turno. Probá de nuevo.",
      },
    };
  }

  const turnoId = (resultado as { id: string }).id;

  console.info(
    `[turno] creado turnoId=${turnoId} origen=admin tel=${telefonoNorm} inicio=${inicio.toISOString()}`
  );

  // 7. Notificación al barbero (solo si tiene email y el turno es futuro).
  // El cliente NO recibe email: lo notifica el dueño en persona / teléfono.
  // `sendConfirmacionEmails` ya respeta `clienteEmail = null`.
  if (inicio.getTime() > Date.now()) {
    void sendConfirmacionEmails(turnoId);
  }

  // 8. Revalidar agenda y vistas dependientes.
  const fechaYmd = ymdLocal(inicio);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  revalidatePath(`/admin/agenda?fecha=${fechaYmd}`);

  return {
    ok: true,
    data: { turnoId },
  };
}

// ---------------------------------------------------------------------------
// 4. cancelTurnoAdminAction — cancela un turno desde la agenda admin
// ---------------------------------------------------------------------------

const cancelInputSchema = z.object({
  turnoId: z.string().uuid("Turno inválido."),
});

export type CancelTurnoAdminInput = z.input<typeof cancelInputSchema>;

/**
 * Cancela un turno desde el panel admin.
 *
 * A diferencia del flow público (`cancelTurno` en `server/actions/booking.ts`):
 *  - No requiere cancel_token (lo hace el admin con sesión).
 *  - No exige ventana de 3 hs: el dueño puede cancelar en cualquier momento.
 *  - Marca `cancelado_admin` (distinto de `cancelado_cliente`) para diferenciar
 *    auditorialmente quién canceló.
 *
 * Idempotente: si el turno ya está cancelado, devuelve `estado_invalido` (no
 * doble-cancela, no rompe el flujo si se clickea dos veces).
 */
export async function cancelTurnoAdminAction(
  input: CancelTurnoAdminInput
): Promise<ActionResult<{ turnoId: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = cancelInputSchema.safeParse(input);
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

  const { turnoId } = parsed.data;

  const [row] = await db
    .select({
      id: turnos.id,
      estado: turnos.estado,
      inicioTs: turnos.inicioTs,
    })
    .from(turnos)
    .where(eq(turnos.id, turnoId))
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

  try {
    await db
      .update(turnos)
      .set({ estado: "cancelado_admin", updatedAt: new Date() })
      .where(eq(turnos.id, turnoId));
  } catch (err) {
    console.error("[admin.agenda.cancelTurno] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos cancelar el turno. Probá de nuevo.",
      },
    };
  }

  // Aviso a cliente y barbero. Fire-and-forget: ya cancelamos en BD, una falla
  // de notif no debe romper el flujo. `sendCancelacionNotifs` captura todo.
  void sendCancelacionNotifs(turnoId);

  const fechaYmd = ymdLocal(row.inicioTs);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  revalidatePath(`/admin/agenda?fecha=${fechaYmd}`);

  return { ok: true, data: { turnoId } };
}

// ---------------------------------------------------------------------------
// 5. bloquearDesdeTurnoAction — lista negra a partir de un turno
// ---------------------------------------------------------------------------

const bloquearInputSchema = z.object({
  turnoId: z.string().uuid("Turno inválido."),
  /** Qué identificadores del turno bloquear. Al menos uno. */
  bloquearIp: z.boolean().default(false),
  bloquearEmail: z.boolean().default(false),
  bloquearTelefono: z.boolean().default(false),
  motivo: z
    .string()
    .max(300, "El motivo no puede superar los 300 caracteres.")
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
  /** Cancelar además el turno. Casi siempre sí, pero es decisión del dueño. */
  cancelarTurno: z.boolean().default(true),
});

export type BloquearDesdeTurnoInput = z.input<typeof bloquearInputSchema>;

export type BloquearDesdeTurnoOk = {
  bloqueados: { tipo: string; valor: string }[];
  turnoCancelado: boolean;
};

/**
 * Bloquea para el formulario público los identificadores de un turno: la IP
 * desde la que se creó, el email y el teléfono del cliente.
 *
 * Los tres van juntos porque el abusador rota el que puede: el caso real usó
 * tres teléfonos distintos desde una misma IP. Bloquear solo el teléfono no
 * habría servido de nada.
 *
 * La IP puede no estar disponible (turnos cargados por el admin, o previos a la
 * migración 0006). En ese caso simplemente no se bloquea esa dimensión.
 */
export async function bloquearDesdeTurnoAction(
  input: BloquearDesdeTurnoInput
): Promise<ActionResult<BloquearDesdeTurnoOk>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = bloquearInputSchema.safeParse(input);
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

  const { turnoId, bloquearIp, bloquearEmail, bloquearTelefono, motivo, cancelarTurno } =
    parsed.data;

  if (!bloquearIp && !bloquearEmail && !bloquearTelefono) {
    return {
      ok: false,
      error: {
        code: "nada_que_bloquear",
        message: "Elegí al menos un dato para bloquear.",
      },
    };
  }

  const [row] = await db
    .select({
      id: turnos.id,
      estado: turnos.estado,
      inicioTs: turnos.inicioTs,
      creadoIp: turnos.creadoIp,
      clienteEmail: clientes.email,
      clienteTelefono: clientes.telefono,
    })
    .from(turnos)
    .innerJoin(clientes, eq(clientes.id, turnos.clienteId))
    .where(eq(turnos.id, turnoId))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Turno no encontrado." },
    };
  }

  const entradas: NuevoBloqueo[] = [];
  if (bloquearIp && row.creadoIp) {
    entradas.push({ tipo: "ip", valor: row.creadoIp, motivo, turnoOrigenId: turnoId });
  }
  if (bloquearEmail && row.clienteEmail) {
    entradas.push({
      tipo: "email",
      valor: row.clienteEmail,
      motivo,
      turnoOrigenId: turnoId,
    });
  }
  if (bloquearTelefono && row.clienteTelefono) {
    entradas.push({
      tipo: "telefono",
      valor: row.clienteTelefono,
      motivo,
      turnoOrigenId: turnoId,
    });
  }

  if (entradas.length === 0) {
    return {
      ok: false,
      error: {
        code: "sin_datos",
        message:
          "Este turno no tiene esos datos cargados. Si es viejo o lo cargaste vos, no tiene IP registrada.",
      },
    };
  }

  let bloqueados: { tipo: string; valor: string }[];
  let turnoCancelado = false;

  try {
    bloqueados = await bloquearIdentificadores(entradas);

    // Cancelar es una decisión separada del bloqueo: bloquear impide reservas
    // futuras, no toca lo ya agendado. Se ofrece junta porque en la práctica el
    // que bloquea un turno falso también lo quiere fuera de la agenda.
    if (cancelarTurno && row.estado === "confirmado") {
      await db
        .update(turnos)
        .set({ estado: "cancelado_admin", updatedAt: new Date() })
        .where(eq(turnos.id, turnoId));
      turnoCancelado = true;
    }
  } catch (err) {
    console.error("[admin.agenda.bloquearDesdeTurno] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar el bloqueo. Probá de nuevo.",
      },
    };
  }

  console.warn(
    `[security] bloqueo_manual turno=${turnoId} valores=${bloqueados
      .map((b) => `${b.tipo}=${b.valor}`)
      .join(",")} cancelado=${turnoCancelado}`
  );

  // A propósito NO se notifica al cliente de la cancelación: avisarle al que
  // abusa que lo detectaste solo le dice que pruebe de otra forma. Si el dueño
  // quiere avisarle, cancela desde el botón normal, que sí notifica.

  const fechaYmd = ymdLocal(row.inicioTs);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  revalidatePath(`/admin/agenda?fecha=${fechaYmd}`);
  revalidatePath("/admin/config/bloqueos-acceso");

  return { ok: true, data: { bloqueados, turnoCancelado } };
}
