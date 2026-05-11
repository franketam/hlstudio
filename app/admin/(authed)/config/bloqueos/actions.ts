"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { db } from "@/db/client";
import { barberos, bloqueosAgenda } from "@/db/schema";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";

/**
 * CRUD de bloqueos puntuales de agenda (RF-11).
 *
 * Modelo:
 *  - Rango semi-abierto [desdeTs, hastaTs).
 *  - barberoId null → bloquea TODO el local (vacaciones / feriado).
 *  - barberoId no null → solo ese barbero.
 *
 * Reglas de fecha:
 *  - Las fechas vienen del UI como "YYYY-MM-DD" interpretadas en la TZ del local.
 *  - "Un día": [día 00:00 local, día+1 00:00 local).
 *  - "Varios días": [desde 00:00 local, hasta+1 00:00 local).
 *  - Se persisten como timestamptz (UTC).
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type ErrResult = Extract<ActionResult, { ok: false }>;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const inputSchema = z
  .object({
    /** "barbero" | "local". Si "barbero", barberoId es requerido. */
    alcance: z.enum(["barbero", "local"]),
    barberoId: z
      .string()
      .uuid("Barbero inválido.")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v && v.length > 0 ? v : null)),
    tipo: z.enum(["un_dia", "varios_dias"]),
    /** Solo cuando tipo = "un_dia". */
    fecha: z
      .string()
      .regex(YMD_RE, "Fecha inválida.")
      .optional()
      .or(z.literal("")),
    /** Solo cuando tipo = "varios_dias". */
    desde: z
      .string()
      .regex(YMD_RE, "Fecha de inicio inválida.")
      .optional()
      .or(z.literal("")),
    hasta: z
      .string()
      .regex(YMD_RE, "Fecha de fin inválida.")
      .optional()
      .or(z.literal("")),
    motivo: z
      .string()
      .trim()
      .max(255, "Motivo demasiado largo.")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .superRefine((d, ctx) => {
    if (d.alcance === "barbero" && !d.barberoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barberoId"],
        message: "Elegí un barbero o seleccioná 'Todo el local'.",
      });
    }
    if (d.tipo === "un_dia") {
      if (!d.fecha) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fecha"],
          message: "Fecha inválida.",
        });
      }
    } else {
      if (!d.desde) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["desde"],
          message: "Fecha de inicio inválida.",
        });
      }
      if (!d.hasta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hasta"],
          message: "Fecha de fin inválida.",
        });
      }
    }
  });

export type CreateBloqueoInput = z.input<typeof inputSchema>;

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
  revalidatePath("/admin/config/bloqueos");
  // El flow público depende fuerte: isDiaAbierto + getAvailableSlots leen bloqueos.
  revalidatePath("/reservar");
  revalidatePath("/reservar/dia");
}

/**
 * Convierte una fecha "YYYY-MM-DD" interpretada en la TZ del local a un Date UTC
 * representando la medianoche local de ese día.
 */
function ymdToLocalMidnightUTC(ymd: string): Date {
  return fromZonedTime(`${ymd}T00:00:00`, env.TIMEZONE);
}

/**
 * Suma N días a una fecha "YYYY-MM-DD" y devuelve "YYYY-MM-DD" — operación
 * basada en componentes locales para evitar saltos por horario de verano.
 */
function ymdAddDays(ymd: string, days: number): string {
  // Parseo manual para evitar Date(timestring) que interpreta UTC.
  const [yStr, mStr, dStr] = ymd.split("-");
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  const base = new Date(y, m, d);
  const next = addDays(base, days);
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, "0");
  const nd = String(next.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export async function createBloqueoAction(
  input: CreateBloqueoInput
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

  // Calcular rango [desdeTs, hastaTs) en UTC desde fechas locales.
  let desdeYmd: string;
  let hastaYmdExclusiveStart: string;

  if (data.tipo === "un_dia") {
    desdeYmd = data.fecha!;
    hastaYmdExclusiveStart = ymdAddDays(desdeYmd, 1);
  } else {
    desdeYmd = data.desde!;
    const hastaInclusivo = data.hasta!;
    if (hastaInclusivo < desdeYmd) {
      return {
        ok: false,
        error: {
          code: "validation_error",
          message: "La fecha 'hasta' debe ser igual o posterior a 'desde'.",
        },
      };
    }
    hastaYmdExclusiveStart = ymdAddDays(hastaInclusivo, 1);
  }

  const desdeTs = ymdToLocalMidnightUTC(desdeYmd);
  const hastaTs = ymdToLocalMidnightUTC(hastaYmdExclusiveStart);

  // Sanity: no permitir bloqueos > 1 año en el pasado.
  const unAnoAtras = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  if (desdeTs < unAnoAtras) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "No podés bloquear más de un año hacia atrás.",
      },
    };
  }

  // Si el alcance es barbero, validar que existe y está activo (defensa básica).
  const barberoId = data.alcance === "barbero" ? data.barberoId : null;
  if (barberoId) {
    const [b] = await db
      .select({ id: barberos.id })
      .from(barberos)
      .where(eq(barberos.id, barberoId))
      .limit(1);
    if (!b) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Barbero no encontrado." },
      };
    }
  }

  try {
    const [row] = await db
      .insert(bloqueosAgenda)
      .values({
        barberoId,
        desdeTs,
        hastaTs,
        motivo: data.motivo,
      })
      .returning({ id: bloqueosAgenda.id });

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
    console.error("[admin.bloqueos.create] error", err);
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
 * Eliminación física: un bloqueo borrado no afecta turnos (los turnos no
 * referencian bloqueos), así que es seguro.
 */
export async function deleteBloqueoAction(
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
      .delete(bloqueosAgenda)
      .where(eq(bloqueosAgenda.id, id))
      .returning({ id: bloqueosAgenda.id });

    if (!row) {
      return {
        ok: false,
        error: { code: "no_encontrado", message: "Bloqueo no encontrado." },
      };
    }

    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error("[admin.bloqueos.delete] error", err);
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
 * Variante para <form action={}> server-side. Acepta FormData y redirige.
 */
export async function deleteBloqueoFormAction(
  formData: FormData
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await deleteBloqueoAction(id);
  redirect("/admin/config/bloqueos");
}
