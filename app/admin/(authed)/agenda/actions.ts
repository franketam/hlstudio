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
import { getAvailableSlots, rangesOverlap } from "@/lib/availability";
import { getSession } from "@/lib/session";
import { ymdLocal } from "@/lib/format";
import { sendConfirmacionEmails } from "@/server/email/send-confirmacion";

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
