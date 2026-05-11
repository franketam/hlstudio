import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { barberos, preciosBarberoServicio, servicios } from "@/db/schema";
import type { Barbero, Servicio } from "@/db/schema";

/**
 * Listados completos (activos + inactivos) para el panel.
 * El listado público vive en `server/queries/public.ts` y filtra por activo.
 */

export async function listServiciosAdmin(): Promise<Servicio[]> {
  return db
    .select()
    .from(servicios)
    .orderBy(asc(servicios.orden), asc(servicios.nombre));
}

export async function getServicioByIdAdmin(
  id: string
): Promise<Servicio | null> {
  const [row] = await db
    .select()
    .from(servicios)
    .where(eq(servicios.id, id))
    .limit(1);
  return row ?? null;
}

export async function listBarberosAdmin(): Promise<Barbero[]> {
  return db
    .select()
    .from(barberos)
    .orderBy(asc(barberos.orden), asc(barberos.nombre));
}

export async function getBarberoByIdAdmin(
  id: string
): Promise<Barbero | null> {
  const [row] = await db
    .select()
    .from(barberos)
    .where(eq(barberos.id, id))
    .limit(1);
  return row ?? null;
}

export type MatrizPreciosData = {
  barberos: Array<{ id: string; nombre: string; orden: number }>;
  servicios: Array<{
    id: string;
    nombre: string;
    duracionMin: number;
    orden: number;
  }>;
  /**
   * Mapa "barberoId__servicioId" → precio (string numérico tal como vuelve de pg).
   * Solo incluye filas existentes en BD. Las combinaciones ausentes representan
   * "este barbero no ofrece este servicio".
   */
  precios: Record<string, string>;
};

/**
 * Devuelve barberos activos, servicios activos y todos los precios cargados
 * que correspondan a esos pares activos. Diseñado para la matriz del admin.
 */
export async function getMatrizPrecios(): Promise<MatrizPreciosData> {
  const [barberosRows, serviciosRows, preciosRows] = await Promise.all([
    db
      .select({
        id: barberos.id,
        nombre: barberos.nombre,
        orden: barberos.orden,
      })
      .from(barberos)
      .where(eq(barberos.activo, true))
      .orderBy(asc(barberos.orden), asc(barberos.nombre)),
    db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        duracionMin: servicios.duracionMin,
        orden: servicios.orden,
      })
      .from(servicios)
      .where(eq(servicios.activo, true))
      .orderBy(asc(servicios.orden), asc(servicios.nombre)),
    db
      .select({
        barberoId: preciosBarberoServicio.barberoId,
        servicioId: preciosBarberoServicio.servicioId,
        precio: preciosBarberoServicio.precio,
      })
      .from(preciosBarberoServicio),
  ]);

  const barberoIds = new Set(barberosRows.map((b) => b.id));
  const servicioIds = new Set(serviciosRows.map((s) => s.id));

  const precios: Record<string, string> = {};
  for (const p of preciosRows) {
    // Filtramos a pares (barbero activo × servicio activo). Filas para entidades
    // inactivas siguen viviendo en BD y se restauran si el admin reactiva.
    if (barberoIds.has(p.barberoId) && servicioIds.has(p.servicioId)) {
      precios[`${p.barberoId}__${p.servicioId}`] = p.precio;
    }
  }

  return {
    barberos: barberosRows,
    servicios: serviciosRows,
    precios,
  };
}
