"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { servicios } from "@/db/schema";
import { getSession } from "@/lib/session";

/**
 * CRUD de servicios para el panel admin.
 * - Soft delete: campo `activo`.
 * - Toda mutation revalida las páginas admin de servicios y el flow público.
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const servicioSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  duracionMin: z.coerce
    .number()
    .int("La duración debe ser un número entero.")
    .min(5, "La duración mínima es 5 minutos.")
    .max(480, "La duración máxima es 480 minutos (8 hs)."),
  descripcion: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres.")
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

export type ServicioFormInput = z.input<typeof servicioSchema>;

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

function revalidateAll(): void {
  revalidatePath("/admin/config");
  revalidatePath("/admin/config/servicios");
  // El flow público lista servicios por barbero — si toco un servicio,
  // el precio/duración mostrados pueden cambiar.
  revalidatePath("/reservar");
  revalidatePath("/reservar/servicio");
}

export async function createServicioAction(
  input: ServicioFormInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = servicioSchema.safeParse(input);
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
    const [row] = await db
      .insert(servicios)
      .values({
        nombre: parsed.data.nombre,
        duracionMin: parsed.data.duracionMin,
        descripcion: parsed.data.descripcion,
        orden: parsed.data.orden,
      })
      .returning({ id: servicios.id });

    if (!row) {
      return {
        ok: false,
        error: {
          code: "internal_error",
          message: "No pudimos crear el servicio. Probá de nuevo.",
        },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.servicios.create] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos crear el servicio. Probá de nuevo.",
      },
    };
  }
}

export async function updateServicioAction(
  id: string,
  input: ServicioFormInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  if (!z.string().uuid().safeParse(id).success) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Servicio no encontrado." },
    };
  }

  const parsed = servicioSchema.safeParse(input);
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
    const [row] = await db
      .update(servicios)
      .set({
        nombre: parsed.data.nombre,
        duracionMin: parsed.data.duracionMin,
        descripcion: parsed.data.descripcion,
        orden: parsed.data.orden,
        updatedAt: new Date(),
      })
      .where(eq(servicios.id, id))
      .returning({ id: servicios.id });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Servicio no encontrado." },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.servicios.update] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar los cambios. Probá de nuevo.",
      },
    };
  }
}

export async function toggleServicioActivoAction(
  id: string,
  activo: boolean
): Promise<ActionResult<{ id: string; activo: boolean }>> {
  const auth = await requireSession();
  if (auth) return auth;

  if (!z.string().uuid().safeParse(id).success) {
    return {
      ok: false,
      error: { code: "no_encontrado", message: "Servicio no encontrado." },
    };
  }

  try {
    const [row] = await db
      .update(servicios)
      .set({ activo, updatedAt: new Date() })
      .where(eq(servicios.id, id))
      .returning({ id: servicios.id, activo: servicios.activo });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Servicio no encontrado." },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id, activo: row.activo } };
  } catch (err) {
    console.error("[admin.servicios.toggle] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos actualizar el estado.",
      },
    };
  }
}

/**
 * Variante usada por <form action={}> en server context.
 * Acepta FormData y redirige al listado después de togglear.
 */
export async function toggleServicioActivoFormAction(
  formData: FormData
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const activo = String(formData.get("activo") ?? "") === "true";
  await toggleServicioActivoAction(id, activo);
  redirect("/admin/config/servicios");
}
