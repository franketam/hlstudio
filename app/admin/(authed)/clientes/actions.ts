"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clientes } from "@/db/schema";
import { getSession } from "@/lib/session";

/**
 * Server actions de la sección "Clientes" del panel admin (RF-09).
 *
 * Por ahora solo `updateClienteNotasAction`. La creación de clientes pasa por
 * los flows de reserva pública o de "nuevo turno" admin; no la duplicamos acá.
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

const updateNotasSchema = z.object({
  id: z.string().uuid("Cliente inválido."),
  notas: z
    .string()
    .max(2000, "Las notas no pueden superar los 2000 caracteres.")
    .transform((v) => v.trim()),
});

export type UpdateClienteNotasInput = z.input<typeof updateNotasSchema>;

export async function updateClienteNotasAction(
  input: UpdateClienteNotasInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = updateNotasSchema.safeParse(input);
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

  const { id, notas } = parsed.data;
  // Null si quedó vacío después de trim — evita guardar "" como nota.
  const value = notas.length > 0 ? notas : null;

  try {
    const [row] = await db
      .update(clientes)
      .set({ notasAdmin: value, updatedAt: new Date() })
      .where(eq(clientes.id, id))
      .returning({ id: clientes.id });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Cliente no encontrado." },
      };
    }

    revalidatePath("/admin/clientes");
    revalidatePath(`/admin/clientes/${id}`);

    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.clientes.updateNotas] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar las notas. Probá de nuevo.",
      },
    };
  }
}
