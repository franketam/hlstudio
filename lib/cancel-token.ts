import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Token firmado para el link único del turno.
 *
 * Estructura del token (URL-safe base64): `${turnoId}.${inicioMs}.${signature}`
 * - turnoId: uuid del turno
 * - inicioMs: epoch ms del inicio (sirve como nonce y para invalidación si cambia el horario)
 * - signature: HMAC-SHA256 base64url del payload `${turnoId}|${inicioMs}` con CANCEL_TOKEN_SECRET
 *
 * Verificación posterior: si el HMAC matchea, el portador efectivamente reservó.
 * No expira por sí solo — la "expiración" la define la regla de cancelación
 * (3h antes del turno) que vive en la server action de cancelar.
 */

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function sign(turnoId: string, inicioMs: number): string {
  const payload = `${turnoId}|${inicioMs}`;
  const mac = createHmac("sha256", env.CANCEL_TOKEN_SECRET).update(payload).digest();
  return toBase64Url(mac);
}

export function buildCancelToken(turnoId: string, inicioTs: Date): string {
  const inicioMs = inicioTs.getTime();
  const sig = sign(turnoId, inicioMs);
  // Token compacto, URL-safe.
  return `${turnoId}.${inicioMs}.${sig}`;
}

export type ParsedToken = {
  turnoId: string;
  inicioMs: number;
};

/**
 * Verifica el token. Retorna el payload si es válido, o null si no.
 * Usa timingSafeEqual para evitar timing attacks.
 */
export function verifyCancelToken(token: string): ParsedToken | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [turnoId, inicioMsStr, sig] = parts;
  if (!turnoId || !inicioMsStr || !sig) return null;

  const inicioMs = Number(inicioMsStr);
  if (!Number.isFinite(inicioMs) || inicioMs <= 0) return null;

  const expected = sign(turnoId, inicioMs);
  let a: Buffer;
  let b: Buffer;
  try {
    a = fromBase64Url(sig);
    b = fromBase64Url(expected);
  } catch {
    return null;
  }
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { turnoId, inicioMs };
}
