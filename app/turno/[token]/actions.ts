"use server";

import { cancelTurno } from "@/server/actions/booking";

export async function cancelTurnoAction(token: string) {
  return cancelTurno(decodeURIComponent(token));
}
