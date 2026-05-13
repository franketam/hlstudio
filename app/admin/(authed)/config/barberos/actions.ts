"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { barberos } from "@/db/schema";
import { getSession } from "@/lib/session";
import { normalizarTelefonoAR } from "@/lib/phone";

/**
 * CRUD de barberos para el panel admin.
 * - Soft delete: campo `activo`.
 * - foto_url se acepta solo como string URL (upload viene en una iteración futura).
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const barberoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  fotoUrl: z
    .string()
    .trim()
    .url("La foto debe ser una URL válida (https://...).")
    .max(2048, "URL demasiado larga.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
  descripcion: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
  email: z
    .string()
    .trim()
    .email("Ingresá un email válido.")
    .max(254, "Email demasiado largo.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
  telefono: z
    .string()
    .trim()
    .max(40, "Teléfono demasiado largo.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
  orden: z.coerce
    .number()
    .int("El orden debe ser entero.")
    .min(0, "El orden no puede ser negativo.")
    .max(999, "Orden demasiado alto.")
    .optional()
    .default(0),
});

export type BarberoFormInput = z.input<typeof barberoSchema>;

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

/**
 * Best-effort: si el normalizador encuentra un E.164 válido lo usa; sino guarda
 * el string original (tal cual lo ingresó el admin). El dispatcher después
 * vuelve a intentar normalizar al momento de enviar.
 */
function normalizarTelOrFallback(input: string | null): string | null {
  if (!input) return null;
  return normalizarTelefonoAR(input) ?? input;
}

function revalidateAll(): void {
  revalidatePath("/admin/config");
  revalidatePath("/admin/config/barberos");
  // Landing pública + paso 1 de reserva listan barberos activos.
  revalidatePath("/");
  revalidatePath("/reservar");
}

export async function createBarberoAction(
  input: BarberoFormInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = barberoSchema.safeParse(input);
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

  const telefonoNorm = normalizarTelOrFallback(parsed.data.telefono);

  try {
    const [row] = await db
      .insert(barberos)
      .values({
        nombre: parsed.data.nombre,
        fotoUrl: parsed.data.fotoUrl,
        descripcion: parsed.data.descripcion,
        email: parsed.data.email,
        telefono: telefonoNorm,
        orden: parsed.data.orden,
      })
      .returning({ id: barberos.id });

    if (!row) {
      return {
        ok: false,
        error: {
          code: "internal_error",
          message: "No pudimos crear el barbero. Probá de nuevo.",
        },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.barberos.create] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos crear el barbero. Probá de nuevo.",
      },
    };
  }
}

export async function updateBarberoAction(
  id: string,
  input: BarberoFormInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  if (!z.string().uuid().safeParse(id).success) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Barbero no encontrado." },
    };
  }

  const parsed = barberoSchema.safeParse(input);
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

  const telefonoNorm = normalizarTelOrFallback(parsed.data.telefono);

  try {
    const [row] = await db
      .update(barberos)
      .set({
        nombre: parsed.data.nombre,
        fotoUrl: parsed.data.fotoUrl,
        descripcion: parsed.data.descripcion,
        email: parsed.data.email,
        telefono: telefonoNorm,
        orden: parsed.data.orden,
        updatedAt: new Date(),
      })
      .where(eq(barberos.id, id))
      .returning({ id: barberos.id });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Barbero no encontrado." },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.barberos.update] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar los cambios. Probá de nuevo.",
      },
    };
  }
}

export async function toggleBarberoActivoAction(
  id: string,
  activo: boolean
): Promise<ActionResult<{ id: string; activo: boolean }>> {
  const auth = await requireSession();
  if (auth) return auth;

  if (!z.string().uuid().safeParse(id).success) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Barbero no encontrado." },
    };
  }

  try {
    const [row] = await db
      .update(barberos)
      .set({ activo, updatedAt: new Date() })
      .where(eq(barberos.id, id))
      .returning({ id: barberos.id, activo: barberos.activo });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Barbero no encontrado." },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id, activo: row.activo } };
  } catch (err) {
    console.error("[admin.barberos.toggle] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos actualizar el estado.",
      },
    };
  }
}

export async function toggleBarberoActivoFormAction(
  formData: FormData
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const activo = String(formData.get("activo") ?? "") === "true";
  await toggleBarberoActivoAction(id, activo);
  redirect("/admin/config/barberos");
}
