"use server";

import { z } from "zod";
import { eq, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { barberos, bloqueosRecurrentes } from "@/db/schema";
import { getSession } from "@/lib/session";

/**
 * CRUD de bloqueos recurrentes por barbero y día de semana.
 *
 * Modelo:
 *  - Siempre por barbero (barbero_id NOT NULL). Para cerrar el local entero un
 *    día de semana se usa diasDescansoRecurrente, no esta tabla.
 *  - Franja [desde_hora, hasta_hora) semi-abierta, en TZ del local.
 *  - Recurrente: se repite todas las semanas en ese dia_semana indefinidamente.
 *
 * Reglas de hora:
 *  - Vienen del UI como "HH:MM". Se persisten como time "HH:MM:00".
 *  - "Día completo" = 00:00 → 23:59 (el form lo setea con un checkbox).
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type ErrResult = Extract<ActionResult, { ok: false }>;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const inputSchema = z
  .object({
    barberoId: z.string().uuid("Barbero inválido."),
    diaSemana: z.coerce
      .number()
      .int()
      .min(0, "Día inválido.")
      .max(6, "Día inválido."),
    desdeHora: z.string().regex(HHMM_RE, "Hora de inicio inválida."),
    hastaHora: z.string().regex(HHMM_RE, "Hora de fin inválida."),
    motivo: z
      .string()
      .trim()
      .max(255, "Motivo demasiado largo.")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .superRefine((d, ctx) => {
    if (d.desdeHora >= d.hastaHora) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hastaHora"],
        message: "La hora 'hasta' debe ser posterior a 'desde'.",
      });
    }
  });

export type CreateBloqueoRecurrenteInput = z.input<typeof inputSchema>;

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

function revalidateAll(): void {
  revalidatePath("/admin/config");
  revalidatePath("/admin/config/bloqueos-recurrentes");
  // El flow público depende: getAvailableSlots lee bloqueos recurrentes.
  revalidatePath("/reservar");
  revalidatePath("/reservar/dia");
  // La agenda admin valida bloqueos recurrentes al crear turno futuro.
  revalidatePath("/admin/agenda");
}

export async function createBloqueoRecurrenteAction(
  input: CreateBloqueoRecurrenteInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = inputSchema.safeParse(input);
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

  const data = parsed.data;

  // Validar barbero existente y activo.
  const [b] = await db
    .select({ id: barberos.id, activo: barberos.activo })
    .from(barberos)
    .where(eq(barberos.id, data.barberoId))
    .limit(1);
  if (!b || !b.activo) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Barbero no encontrado." },
    };
  }

  try {
    const [row] = await db
      .insert(bloqueosRecurrentes)
      .values({
        barberoId: data.barberoId,
        diaSemana: data.diaSemana,
        desdeHora: `${data.desdeHora}:00`,
        hastaHora: `${data.hastaHora}:00`,
        motivo: data.motivo,
      })
      .returning({ id: bloqueosRecurrentes.id });

    if (!row) {
      return {
        ok: false,
        error: {
          code: "internal_error",
          message: "No pudimos guardar el bloqueo. Probá de nuevo.",
        },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.bloqueosRecurrentes.create] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar el bloqueo. Probá de nuevo.",
      },
    };
  }
}

/**
 * Eliminación física. Los turnos no referencian bloqueos recurrentes, así que
 * es seguro: borrarlo sólo reabre la disponibilidad futura de esa franja.
 */
export async function deleteBloqueoRecurrenteAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  if (!z.string().uuid().safeParse(id).success) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Bloqueo no encontrado." },
    };
  }

  try {
    const [row] = await db
      .delete(bloqueosRecurrentes)
      .where(eq(bloqueosRecurrentes.id, id))
      .returning({ id: bloqueosRecurrentes.id });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Bloqueo no encontrado." },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.bloqueosRecurrentes.delete] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos eliminar el bloqueo. Probá de nuevo.",
      },
    };
  }
}

/**
 * Activa/desactiva un bloqueo recurrente sin borrar la fila.
 * Desactivado = no resta disponibilidad (getAvailableSlots filtra por activo=true).
 * Si no se pasa `activo`, alterna el estado actual.
 */
export async function toggleBloqueoRecurrenteAction(
  id: string,
  activo?: boolean
): Promise<ActionResult<{ id: string; activo: boolean }>> {
  const auth = await requireSession();
  if (auth) return auth;

  if (!z.string().uuid().safeParse(id).success) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Bloqueo no encontrado." },
    };
  }

  if (activo !== undefined && !z.boolean().safeParse(activo).success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Estado inválido." },
    };
  }

  try {
    const [row] = await db
      .update(bloqueosRecurrentes)
      .set({
        activo:
          activo === undefined ? not(bloqueosRecurrentes.activo) : activo,
        updatedAt: new Date(),
      })
      .where(eq(bloqueosRecurrentes.id, id))
      .returning({
        id: bloqueosRecurrentes.id,
        activo: bloqueosRecurrentes.activo,
      });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Bloqueo no encontrado." },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id, activo: row.activo } };
  } catch (err) {
    console.error("[admin.bloqueosRecurrentes.toggle] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos actualizar el bloqueo. Probá de nuevo.",
      },
    };
  }
}

/**
 * Variante para <form action={}> server-side. Acepta FormData y redirige.
 */
export async function deleteBloqueoRecurrenteFormAction(
  formData: FormData
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await deleteBloqueoRecurrenteAction(id);
  redirect("/admin/config/bloqueos-recurrentes");
}
