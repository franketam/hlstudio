import "server-only";

import { headers } from "next/headers";
import { getClientIp } from "@/lib/rate-limit";
import { describirUserAgent, pareceAutomatizado } from "@/lib/user-agent";

/**
 * Datos de origen de un request público (IP + navegador).
 *
 * Existe para poder responder, ante una oleada de turnos falsos, la única
 * pregunta que importa: ¿son muchas personas o una sola cambiando de IP?
 *
 * La IP es más confiable que el user-agent, pero también se rota con datos
 * móviles o VPN. Ver la advertencia de `lib/user-agent.ts`.
 */

/** Tope de guardado del UA. Los reales rondan 120-200 chars; 500 es holgado. */
const MAX_USER_AGENT = 500;

export type RequestInfo = {
  /** IP del cliente según x-forwarded-for. "unknown" si el proxy no la manda. */
  ip: string;
  /** User-agent crudo, truncado. Null si no vino. */
  userAgent: string | null;
  /** Etiqueta corta y legible para logs y panel, ej "Chrome 141 · Android". */
  navegador: string;
  /** El user-agent tiene firma de automatización (curl, python, headless…). */
  sospechoso: boolean;
};

export async function getRequestInfo(): Promise<RequestInfo> {
  const h = await headers();
  const raw = h.get("user-agent");
  const userAgent = raw ? raw.slice(0, MAX_USER_AGENT) : null;

  return {
    ip: await getClientIp(),
    userAgent,
    navegador: describirUserAgent(userAgent),
    sospechoso: pareceAutomatizado(userAgent),
  };
}
