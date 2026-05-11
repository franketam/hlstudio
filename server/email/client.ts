import { Resend } from "resend";
import { env } from "@/lib/env";

/**
 * Cliente Resend singleton.
 *
 * Modo "off": si `RESEND_API_KEY` está vacío (típico en dev sin email),
 * `sendEmail` corta antes y devuelve {ok:false, error:"no_api_key"}.
 * El módulo de envío trata esto como un caso conocido (lo loguea, no rompe).
 */

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Recomendado para deliverability. */
  text?: string;
  /** Para Reply-To custom (default: usa el From). */
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; providerId: string | null }
  | { ok: false; error: string };

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const client = getResend();
  if (!client) {
    return { ok: false, error: "no_api_key" };
  }

  const from = env.RESEND_FROM_NAME
    ? `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`
    : env.RESEND_FROM_EMAIL;

  try {
    const res = await client.emails.send({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });

    if (res.error) {
      return {
        ok: false,
        error: `${res.error.name ?? "resend_error"}: ${res.error.message ?? "sin detalle"}`,
      };
    }

    return { ok: true, providerId: res.data?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `exception: ${msg}` };
  }
}
