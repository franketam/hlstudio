import { Resend } from "resend";

/**
 * Cliente Resend singleton.
 *
 * Modo "off": si `RESEND_API_KEY` está vacío (típico en dev sin email),
 * `sendEmail` corta antes y devuelve {ok:false, error:"no_api_key"}.
 * El módulo de envío trata esto como un caso conocido (lo loguea, no rompe).
 *
 * Lee las env vars de forma lazy via `process.env` para que este módulo se
 * pueda usar tanto desde Next (donde `lib/env` ya validó todo) como desde
 * scripts CLI standalone (que cargan `.env.local` manualmente DESPUÉS de los
 * imports — si acá importáramos `lib/env`, su Zod parseEnv() correría antes
 * de que el script cargue el .env.local y abortaría con "DATABASE_URL Required").
 */

let _resend: Resend | null = null;
let _lastKey: string | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) return null;
  if (!_resend || _lastKey !== key) {
    _resend = new Resend(key);
    _lastKey = key;
  }
  return _resend;
}

function getFrom(): string {
  const email = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const name = process.env.RESEND_FROM_NAME || "HLstudio";
  return name ? `${name} <${email}>` : email;
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
  | { ok: false; error: string; errorName?: string };

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const client = getResend();
  if (!client) {
    return { ok: false, error: "no_api_key" };
  }

  try {
    const res = await client.emails.send({
      from: getFrom(),
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
        errorName: res.error.name,
      };
    }

    return { ok: true, providerId: res.data?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `exception: ${msg}` };
  }
}
