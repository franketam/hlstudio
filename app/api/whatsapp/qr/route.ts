import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getBotQr } from "@/server/whatsapp/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/qr — proxy autenticado al bot para obtener el QR vigente.
 */
export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { ok: false, error: "no autorizado" },
      { status: 401 }
    );
  }

  const r = await getBotQr();
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, qr: r.qrDataUrl });
}
