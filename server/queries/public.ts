import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  barberos,
  preciosBarberoServicio,
  servicios,
} from "@/db/schema";

export type BarberoPublico = {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  descripcion: string | null;
  orden: number;
};

export async function listBarberosActivos(): Promise<BarberoPublico[]> {
  const rows = await db
    .select({
      id: barberos.id,
      nombre: barberos.nombre,
      fotoUrl: barberos.fotoUrl,
      descripcion: barberos.descripcion,
      orden: barberos.orden,
    })
    .from(barberos)
    .where(eq(barberos.activo, true))
    .orderBy(asc(barberos.orden), asc(barberos.nombre));
  return rows;
}

export type ServicioConPrecio = {
  id: string;
  nombre: string;
  duracionMin: number;
  descripcion: string | null;
  precio: string; // "16000.00" tal cual vuelve de pg numeric
  orden: number;
};

/**
 * Lista los servicios activos con el precio del barbero indicado.
 * Si un servicio no tiene precio para ese barbero, no se incluye.
 */
export async function listServiciosConPrecioPorBarbero(
  barberoId: string
): Promise<ServicioConPrecio[]> {
  const rows = await db
    .select({
      id: servicios.id,
      nombre: servicios.nombre,
      duracionMin: servicios.duracionMin,
      descripcion: servicios.descripcion,
      precio: preciosBarberoServicio.precio,
      orden: servicios.orden,
    })
    .from(servicios)
    .innerJoin(
      preciosBarberoServicio,
      and(
        eq(preciosBarberoServicio.servicioId, servicios.id),
        eq(preciosBarberoServicio.barberoId, barberoId)
      )
    )
    .where(eq(servicios.activo, true))
    .orderBy(asc(servicios.orden), asc(servicios.nombre));
  return rows;
}

export async function getBarberoPublico(
  id: string
): Promise<BarberoPublico | null> {
  const [row] = await db
    .select({
      id: barberos.id,
      nombre: barberos.nombre,
      fotoUrl: barberos.fotoUrl,
      descripcion: barberos.descripcion,
      orden: barberos.orden,
    })
    .from(barberos)
    .where(and(eq(barberos.id, id), eq(barberos.activo, true)))
    .limit(1);
  return row ?? null;
}

export async function getServicioConPrecio(
  servicioId: string,
  barberoId: string
): Promise<ServicioConPrecio | null> {
  const rows = await listServiciosConPrecioPorBarbero(barberoId);
  return rows.find((s) => s.id === servicioId) ?? null;
}
