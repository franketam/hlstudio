"use server";

import { createTurno } from "@/server/actions/booking";
import type { CreateTurnoInput } from "@/server/actions/booking";

/**
 * Wrapper para invocar createTurno desde el Client Component.
 * Mantiene la action pública en este módulo (cerca del componente que la usa)
 * y reusa la lógica del módulo `server/actions/booking`.
 */
export async function createTurnoAction(input: CreateTurnoInput) {
  return createTurno(input);
}
