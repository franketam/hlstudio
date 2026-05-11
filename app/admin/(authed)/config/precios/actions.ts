"use server";

import { z } from "zod";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { barberos, preciosBarberoServicio, servicios } from "@/db/schema";
import { getSession } from "@/lib/session";

/**
 * Bulk-upsert + delete de la matriz de precios barbero × servicio.
 *
 * Convención:
 * - Cada item con `precio` numérico → upsert (insert o update por PK compuesta).
 * - Cada item con `precio === null` → DELETE de la fila (el admin vació la celda).
 *   `preciosBarberoServicio` no es referenciada por FK desde turnos (turno
 *   guarda `precio_total` snapshoteado), así que el hard-delete es seguro.
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// numeric(12, 2) → permitimos 10 dígitos enteros + 2 decimales.
const precioSchema = z
  .number({ invalid_type_error: "El precio debe ser un número." })
  .finite("El precio debe ser un número finito.")
  .min(0, "El precio no puede ser negativo.")
  .max(9_999_999.99, "El precio supera el máximo permitido.");

const itemSchema = z.object({
  barberoId: z.string().uuid("ID de barbero inválido."),
  servicioId: z.string().uuid("ID de servicio inválido."),
  // null = la celda quedó vacía → DELETE; número = upsert.
  precio: precioSchema.nullable(),
});

const payloadSchema = z.object({
  items: z
    .array(itemSchema)
    .min(1, "No hay cambios para guardar.")
    .max(500, "Demasiados cambios en una sola operación."),
});

export type SavePreciosInput = z.input<typeof payloadSchema>;

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
  revalidatePath("/admin/config/precios");
  // El flow público consume precios por barbero — cualquier cambio impacta lo
  // que ve el cliente al elegir servicio.
  revalidatePath("/reservar");
  revalidatePath("/reservar/servicio");
}

/**
 * Convierte un number a string con 2 decimales para insertar en pg numeric.
 */
function precioToNumericString(n: number): string {
  return n.toFixed(2);
}

export async function savePreciosAction(
  input: SavePreciosInput
): Promise<ActionResult<{ upserted: number; deleted: number }>> {
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

  const items = parsed.data.items;

  // Deduplico por (barberoId, servicioId) — si llegan dos cambios al mismo par
  // me quedo con el último. Defensa contra payloads mal armados desde el cliente.
  const byKey = new Map<string, { barberoId: string; servicioId: string; precio: number | null }>();
  for (const it of items) {
    byKey.set(`${it.barberoId}__${it.servicioId}`, it);
  }
  const dedup = Array.from(byKey.values());

  const toUpsert = dedup.filter(
    (i): i is { barberoId: string; servicioId: string; precio: number } =>
      i.precio !== null
  );
  const toDelete = dedup.filter((i) => i.precio === null);

  // Valido que todos los IDs referenciados existan y estén activos. Evita que
  // un payload con IDs random cree filas para entidades fantasma.
  const allBarberoIds = Array.from(new Set(dedup.map((i) => i.barberoId)));
  const allServicioIds = Array.from(new Set(dedup.map((i) => i.servicioId)));

  try {
    const [barberosOk, serviciosOk] = await Promise.all([
      db
        .select({ id: barberos.id })
        .from(barberos)
        .where(
          and(inArray(barberos.id, allBarberoIds), eq(barberos.activo, true))
        ),
      db
        .select({ id: servicios.id })
        .from(servicios)
        .where(
          and(inArray(servicios.id, allServicioIds), eq(servicios.activo, true))
        ),
    ]);

    if (barberosOk.length !== allBarberoIds.length) {
      return {
        ok: false,
        error: {
          code: "validation_error",
          message: "Hay barberos inválidos o inactivos en los cambios.",
        },
      };
    }
    if (serviciosOk.length !== allServicioIds.length) {
      return {
        ok: false,
        error: {
          code: "validation_error",
          message: "Hay servicios inválidos o inactivos en los cambios.",
        },
      };
    }

    let upserted = 0;
    let deleted = 0;

    await db.transaction(async (tx) => {
      if (toUpsert.length > 0) {
        await tx
          .insert(preciosBarberoServicio)
          .values(
            toUpsert.map((i) => ({
              barberoId: i.barberoId,
              servicioId: i.servicioId,
              precio: precioToNumericString(i.precio),
            }))
          )
          .onConflictDoUpdate({
            target: [
              preciosBarberoServicio.barberoId,
              preciosBarberoServicio.servicioId,
            ],
            set: {
              precio: sql`excluded.precio`,
              updatedAt: new Date(),
            },
          });
        upserted = toUpsert.length;
      }

      if (toDelete.length > 0) {
        // Borro fila por fila con OR de pares. Con N <= 500 es aceptable; si
        // crece, migrar a un VALUES + join.
        const conditions = toDelete.map((i) =>
          and(
            eq(preciosBarberoServicio.barberoId, i.barberoId),
            eq(preciosBarberoServicio.servicioId, i.servicioId)
          )
        );
        const result = await tx
          .delete(preciosBarberoServicio)
          .where(or(...conditions))
          .returning({ barberoId: preciosBarberoServicio.barberoId });
        deleted = result.length;
      }
    });

    revalidateAll();
    return { ok: true, data: { upserted, deleted } };
  } catch (err) {
    console.error("[admin.precios.save] error", err);
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: "No pudimos guardar los cambios. Probá de nuevo.",
      },
    };
  }
}
