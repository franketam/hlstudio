import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { barberos, servicios } from "@/db/schema";
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
