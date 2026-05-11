import { NextResponse } from "next/server";

/**
 * Healthcheck para Coolify / load balancer / uptime monitor.
 * No toca la BD a propósito — un fallo de BD no debe tirar el contenedor.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
