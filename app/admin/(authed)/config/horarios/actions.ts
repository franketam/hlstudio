"use server";

import { z } from "zod";
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { diasDescansoRecurrente, horariosOperacion } from "@/db/schema";
import { getSession } from "@/lib/session";
import { DIAS_SEMANA_ES } from "@/lib/constants";

/**
 * Bulk-replace transaccional de los horarios de operación + días de descanso
 * recurrente.
 *
 * Estrategia (intencionalmente simple por bajo volumen — 7 días × ~3 rangos):
 *  1. Cliente manda el estado completo de cada día tocado (dirty).
 *  2. Por día tocado: DELETE de horariosOperacion + de diasDescansoRecurrente.
 *  3. Si abierto → INSERT de los rangos. Si cerrado → INSERT en descansos con
 *     motivo = nombre del día en español (consistente con el seed).
 *  4. Todo dentro de una sola transacción.
 *
 * Validaciones server-side:
 *  - Formato HH:MM
 *  - Apertura < cierre
 *  - No overlaps dentro del mismo día
 *  - Si abierto, >= 1 rango
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type ErrResult = Extract<ActionResult, { ok: false }>;

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const rangoSchema = z
  .object({
    apertura: z.string().regex(HHMM_RE, "Formato HH:MM inválido."),
    cierre: z.string().regex(HHMM_RE, "Formato HH:MM inválido."),
  })
  .refine((r) => toMinutes(r.apertura) < toMinutes(r.cierre), {
    message: "La apertura debe ser anterior al cierre.",
  });

const diaSchema = z
  .object({
    diaSemana: z
      .number()
      .int()
      .min(0, "Día inválido.")
      .max(6, "Día inválido."),
    abierto: z.boolean(),
    rangos: z.array(rangoSchema).max(8, "Demasiados rangos por día."),
  })
  .superRefine((d, ctx) => {
    if (d.abierto && d.rangos.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si el día está abierto necesita al menos un rango horario.",
      });
      return;
    }
    if (!d.abierto && d.rangos.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Un día cerrado no puede tener rangos.",
      });
      return;
    }
    // Anti-overlap: ordeno por apertura y verifico que cada cierre <= apertura siguiente.
    const sorted = [...d.rangos].sort(
      (a, b) => toMinutes(a.apertura) - toMinutes(b.apertura)
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (toMinutes(curr.apertura) < toMinutes(prev.cierre)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Los rangos no pueden solaparse dentro del mismo día.",
        });
        return;
      }
    }
  });

const payloadSchema = z.object({
  dias: z
    .array(diaSchema)
    .min(1, "No hay cambios para guardar.")
    .max(7, "Demasiados días en una sola operación."),
});

export type SaveHorariosInput = z.input<typeof payloadSchema>;

function toMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":");
  return Number(hh ?? "0") * 60 + Number(mm ?? "0");
}

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
  revalidatePath("/admin/config/horarios");
  // El flow público depende fuerte de estos datos: isDiaAbierto y getAvailableSlots.
  revalidatePath("/reservar");
  revalidatePath("/reservar/dia");
}

export async function saveHorariosAction(
  input: SaveHorariosInput
): Promise<ActionResult<{ diasActualizados: number }>> {
  const auth = await requireSession();
  if (auth) return auth;

  const parsed = payloadSchema.safeParse(input);
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

  // Deduplico por diaSemana — si llegan dos cambios para el mismo día me quedo
  // con el último. Defensa contra payloads mal armados.
  const byDia = new Map<number, (typeof parsed.data.dias)[number]>();
  for (const d of parsed.data.dias) byDia.set(d.diaSemana, d);
  const dias = Array.from(byDia.values());
  const diasSemana = dias.map((d) => d.diaSemana);

  try {
    await db.transaction(async (tx) => {
      // Borro todo lo viejo de los días tocados en ambas tablas.
      await tx
        .delete(horariosOperacion)
        .where(inArray(horariosOperacion.diaSemana, diasSemana));
      await tx
        .delete(diasDescansoRecurrente)
        .where(inArray(diasDescansoRecurrente.diaSemana, diasSemana));

      // Inserto el estado nuevo.
      const horariosToInsert: Array<{
        diaSemana: number;
        apertura: string;
        cierre: string;
        activo: boolean;
      }> = [];
      const descansosToInsert: Array<{
        diaSemana: number;
        motivo: string;
      }> = [];

      for (const d of dias) {
        if (d.abierto) {
          for (const r of d.rangos) {
            horariosToInsert.push({
              diaSemana: d.diaSemana,
              apertura: `${r.apertura}:00`,
              cierre: `${r.cierre}:00`,
              activo: true,
            });
          }
        } else {
          descansosToInsert.push({
            diaSemana: d.diaSemana,
            motivo: DIAS_SEMANA_ES[d.diaSemana] ?? `Día ${d.diaSemana}`,
          });
        }
      }

      if (horariosToInsert.length > 0) {
        await tx.insert(horariosOperacion).values(horariosToInsert);
      }
      if (descansosToInsert.length > 0) {
        await tx.insert(diasDescansoRecurrente).values(descansosToInsert);
      }
    });

    revalidateAll();
    return { ok: true, data: { diasActualizados: dias.length } };
  } catch (err) {
    console.error("[admin.horarios.save] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar los cambios. Probá de nuevo.",
      },
    };
  }
}
