import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getBotStatus } from "@/server/whatsapp/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/status — proxy autenticado al bot.
 * Solo accesible con sesión admin (no expone el bot al público).
 */
export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { ok: false, error: "no autorizado" },
      { status: 401 }
    );
  }

  const r = await getBotStatus();
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: r.status });
}
