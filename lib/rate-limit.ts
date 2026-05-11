import "server-only";

import { headers } from "next/headers";

/**
 * Rate limit in-memory simple para endpoints públicos.
 *
 * Diseñado para el volumen de un local (HLstudio): no necesita Redis ni Upstash.
 * Cada instancia del proceso Node mantiene su propio Map; en deploys multi-réplica
 * el límite se aplica por réplica, lo cual sigue siendo aceptable para abuso casual.
 *
 * Estrategia: ventana fija (no rolling). Cada (key, windowMs) tiene un contador
 * y un timer que limpia la entrada al expirar la ventana. Esto evita acumular
 * keys muertas en memoria.
 */

type Entry = {
  count: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
};

// Un Map por proceso. Se inicializa lazy.
const store = new Map<string, Entry>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number };

/**
 * Chequea y consume un slot del rate limit.
 *
 * @param key   identificador único (ej. `"reservar:1.2.3.4"`).
 * @param limit cantidad máxima de hits permitidos dentro de la ventana.
 * @param windowMs duración de la ventana en milisegundos.
 * @returns      `{ ok: true, remaining, resetAt }` si todavía hay cupo.
 *               `{ ok: false, remaining: 0, resetAt }` si se excedió.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.expiresAt <= now) {
    // Nueva ventana. Limpiamos timer viejo por las dudas.
    if (existing) clearTimeout(existing.timer);

    const expiresAt = now + windowMs;
    const timer = setTimeout(() => {
      store.delete(key);
    }, windowMs);
    // Evitamos que un timer activo retenga el proceso vivo al apagar.
    if (typeof timer.unref === "function") timer.unref();

    store.set(key, { count: 1, expiresAt, timer });
    return { ok: true, remaining: limit - 1, resetAt: expiresAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.expiresAt };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    resetAt: existing.expiresAt,
  };
}

/**
 * Obtiene la IP del cliente desde los headers entrantes.
 *
 * Coolify (y la mayoría de los reverse proxies) setea `x-forwarded-for` con la
 * lista de IPs `cliente, proxy1, proxy2`. Tomamos la primera, que corresponde
 * al cliente real.
 *
 * Fallbacks:
 *  - `x-real-ip` si el proxy lo setea (algunos lo hacen).
 *  - `"unknown"` si no hay info. Para evitar que toda la población "unknown"
 *    se rate-limitee entre sí (que sería un DoS auto-infligido), agregamos
 *    un sufijo aleatorio... NO. Mejor mantener `"unknown"` y aceptar que
 *    requests sin header se traten como una misma identidad. En la práctica
 *    detrás de Coolify SIEMPRE hay XFF, así que esto solo aplica a dev.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();

  const xff = h.get("x-forwarded-for");
  if (xff) {
    // "client, proxy1, proxy2" -> "client"
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

/**
 * Helper compuesto: obtiene IP y chequea rate limit en un solo paso.
 * Loggea con prefijo [security] cuando se excede el límite.
 */
export async function checkRateLimitForRoute(
  route: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const ip = await getClientIp();
  const key = `${route}:${ip}`;
  const result = checkRateLimit(key, limit, windowMs);

  if (!result.ok) {
    console.warn(
      `[security] rate_limited route=${route} ip=${ip} limit=${limit} windowMs=${windowMs}`
    );
  }

  return result;
}

/**
 * Constantes de límite reutilizables. Centralizadas para tunear sin tocar callers.
 */
export const RATE_LIMITS = {
  CREATE_TURNO: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 / hora
  LOGIN: { limit: 10, windowMs: 15 * 60 * 1000 }, // 10 / 15 min
  CANCEL_TURNO: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 / hora
} as const;
