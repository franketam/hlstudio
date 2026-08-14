"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { normalizarTelefonoAR } from "@/lib/phone";
import {
  bloquearIdentificadores,
  desbloquearPorIds,
} from "@/server/actions/anti-abuso";

/**
 * Server actions de la lista negra (`/admin/config/bloqueos-acceso`).
 *
 * El alta desde un turno vive en `app/admin/(authed)/agenda/actions.ts`; acá
 * están el alta manual (para bloquear algo que todavía no reservó) y la baja.
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

const altaSchema = z.object({
  tipo: z.enum(["ip", "email", "telefono"]),
  valor: z.string().trim().min(3, "Valor demasiado corto."),
  motivo: z
    .string()
    .max(300, "El motivo no puede superar los 300 caracteres.")
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
});

export type CrearBloqueoInput = z.input<typeof altaSchema>;

export async function crearBloqueoAction(
  input: CrearBloqueoInput
): Promise<ActionResult<{ tipo: string; valor: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = altaSchema.safeParse(input);
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

  const { tipo, motivo } = parsed.data;
  let { valor } = parsed.data;

  // El teléfono se guarda en E.164 igual que en `clientes.telefono`: si se
  // guardara como lo tipeó el admin, el bloqueo no matchearía nunca contra lo
  // que manda el formulario.
  if (tipo === "telefono") {
    const norm = normalizarTelefonoAR(valor);
    if (!norm) {
      return {
        ok: false,
        error: {
          code: "telefono_invalido",
          message:
            "No pude interpretar ese teléfono. Poné código de área y número, sin el 0 ni el 15.",
        },
      };
    }
    valor = norm;
  }

  if (tipo === "email" && !z.string().email().safeParse(valor).success) {
    return {
      ok: false,
      error: { code: "email_invalido", message: "Ese email no es válido." },
    };
  }

  try {
    const [creado] = await bloquearIdentificadores([{ tipo, valor, motivo }]);
    if (!creado) {
      return {
        ok: false,
        error: { code: "sin_datos", message: "No hubo nada que bloquear." },
      };
    }
    console.warn(
      `[security] bloqueo_manual_directo tipo=${creado.tipo} valor=${creado.valor}`
    );
    revalidatePath("/admin/config/bloqueos-acceso");
    return { ok: true, data: creado };
  } catch (err) {
    console.error("[admin.bloqueos.crear] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar el bloqueo. Probá de nuevo.",
      },
    };
  }
}

const bajaSchema = z.object({ id: z.string().uuid("Bloqueo inválido.") });

export type DesbloquearInput = z.input<typeof bajaSchema>;

export async function desbloquearAction(
  input: DesbloquearInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = bajaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Bloqueo inválido." },
    };
  }

  try {
    const n = await desbloquearPorIds([parsed.data.id]);
    if (n === 0) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Bloqueo no encontrado." },
      };
    }
    console.warn(`[security] desbloqueo id=${parsed.data.id}`);
    revalidatePath("/admin/config/bloqueos-acceso");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (err) {
    console.error("[admin.bloqueos.desbloquear] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos desbloquear. Probá de nuevo.",
      },
    };
  }
}
