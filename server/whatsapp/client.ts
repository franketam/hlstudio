/**
 * Cliente HTTP al bot de WhatsApp (servicio Baileys interno).
 *
 * El bot vive como servicio separado (`services/whatsapp-bot/`). La app principal
 * lo invoca por HTTP. Razones:
 *  - Baileys mantiene estado de sesión que no calza con el modelo serverless
 *    de Next.js (necesita un proceso long-lived).
 *  - Coolify lo despliega como servicio aparte y persistimos `AUTH_DIR` con un
 *    volume.
 *
 * Tolerancia a fallos: si el bot no responde, devolvemos error tipado y el caller
 * decide (típicamente: loggear, dejar registro en `notificaciones_enviadas`, no
 * romper el flujo del usuario).
 *
 * Server-only. No importar desde Client Components.
 *
 * Lee env vars vía `process.env` lazy (no `@/lib/env`) para que el módulo pueda
 * usarse desde scripts CLI standalone que cargan `.env.local` manualmente.
 */

export type SendWaResult =
  | { ok: true; providerId: string | null }
  | {
      ok: false;
      /**
       * - `no_bot_url`: WHATSAPP_BOT_URL vacía (canal off).
       * - `bot_unavailable`: red caída, timeout, 5xx.
       * - `bot_not_ready`: bot vivo pero todavía no pareado (HTTP 503).
       * - `invalid_phone`: número rechazado por el bot (4xx).
       * - `send_failed_permanente`: el bot reportó fallo no recuperable.
       * - `send_failed_transitorio`: error temporal, vale reintentar.
       */
      code:
        | "no_bot_url"
        | "bot_unavailable"
        | "bot_not_ready"
        | "invalid_phone"
        | "send_failed_permanente"
        | "send_failed_transitorio";
      detail?: string;
    };

export type SendWaInput = {
  /** E.164 sin '+' (ej '5491150505050'). El bot también acepta con +, lo normaliza. */
  to: string;
  text: string;
};

/**
 * Timeout chico: el bot debe ser rápido o caemos a fallback / log de error.
 * 8s es generoso pero no bloquea el booking flow indefinidamente.
 */
const WA_TIMEOUT_MS = 8_000;

export async function sendWhatsApp(input: SendWaInput): Promise<SendWaResult> {
  const url = (process.env.WHATSAPP_BOT_URL ?? "").trim();
  if (!url) {
    return { ok: false, code: "no_bot_url" };
  }

  const token = (process.env.WHATSAPP_BOT_TOKEN ?? "").trim();

  // Limpio el "+" — el bot toma el JID así.
  const to = input.to.replace(/^\+/, "").trim();
  if (!/^\d{8,15}$/.test(to)) {
    return {
      ok: false,
      code: "invalid_phone",
      detail: `numero invalido: ${input.to}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WA_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to, text: input.text }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    // Casos por status:
    if (res.status === 503) {
      // bot vivo pero no pareado (ver bot.service: not_ready)
      return {
        ok: false,
        code: "bot_not_ready",
        detail: `bot responde 503 (no pareado): ${await safeText(res)}`,
      };
    }
    if (res.status >= 400 && res.status < 500) {
      const body = await safeText(res);
      return {
        ok: false,
        code: "send_failed_permanente",
        detail: `bot ${res.status}: ${body}`,
      };
    }
    if (res.status >= 500) {
      return {
        ok: false,
        code: "send_failed_transitorio",
        detail: `bot ${res.status}: ${await safeText(res)}`,
      };
    }

    // 2xx — parsear el body
    let body: { ok?: boolean; messageId?: string | null; error?: string };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return {
        ok: false,
        code: "send_failed_transitorio",
        detail: "bot respondio 2xx pero no JSON",
      };
    }

    if (body.ok === false) {
      return {
        ok: false,
        code: "send_failed_permanente",
        detail: body.error ?? "bot reporto ok:false sin detalle",
      };
    }

    return { ok: true, providerId: body.messageId ?? null };
  } catch (err) {
    clearTimeout(timer);
    if ((err as { name?: string })?.name === "AbortError") {
      return {
        ok: false,
        code: "bot_unavailable",
        detail: `timeout tras ${WA_TIMEOUT_MS}ms`,
      };
    }
    return {
      ok: false,
      code: "bot_unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// -------------------------------------------------------------------------
// Aviso al dueño (número pareado por QR)
// -------------------------------------------------------------------------

/**
 * Manda un texto al número con el que está pareado el bot.
 *
 * Para eventos que no tienen destinatario natural: el caso de uso es avisarle
 * al dueño de un intento de reserva rechazado, del que el cliente no debe
 * enterarse. No devuelve error tipado porque todos los callers son
 * fire-and-forget: si el aviso no sale, se loguea y listo.
 */
export async function sendWhatsAppSelf(
  text: string
): Promise<{ ok: boolean; detail?: string }> {
  const url = (process.env.WHATSAPP_BOT_URL ?? "").trim();
  if (!url) return { ok: false, detail: "no_bot_url" };

  const token = (process.env.WHATSAPP_BOT_TOKEN ?? "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WA_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/notify-self`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, detail: `bot ${res.status}: ${await safeText(res)}` };
    }
    return { ok: true };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// -------------------------------------------------------------------------
// Chequeo de existencia — validación del teléfono en el formulario de reserva
// -------------------------------------------------------------------------

/**
 * `exists: null` significa "no se pudo determinar" (bot caído, sin parear, sin
 * URL configurada, timeout). El caller debe dejar pasar la reserva en ese caso:
 * esto es una validación de tipeo / filtro anti-spam, no una barrera de
 * seguridad, y caerse del lado de rechazar convierte cualquier hipo del bot en
 * una caída del formulario de reservas.
 */
export type WaExistsResult = { exists: boolean | null; detail?: string };

/**
 * Timeout más corto que el de envío: esto corre con el cliente esperando
 * frente al formulario. Si el bot no contesta en 4s preferimos dejar pasar el
 * turno antes que hacerlo esperar.
 */
const WA_EXISTS_TIMEOUT_MS = 4_000;

export async function checkWhatsAppExists(
  telefono: string
): Promise<WaExistsResult> {
  const url = (process.env.WHATSAPP_BOT_URL ?? "").trim();
  if (!url) return { exists: null, detail: "no_bot_url" };

  const to = telefono.replace(/^\+/, "").trim();
  if (!/^\d{8,15}$/.test(to)) {
    // Fuera de rango E.164: no hace falta preguntarle a WhatsApp.
    return { exists: false, detail: "formato_invalido" };
  }

  const token = (process.env.WHATSAPP_BOT_TOKEN ?? "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WA_EXISTS_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/exists`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return { exists: null, detail: `bot ${res.status}` };

    const body = (await res.json()) as {
      ok?: boolean;
      exists?: boolean | null;
      unknown?: boolean;
      error?: string;
    };

    if (body.unknown || typeof body.exists !== "boolean") {
      return { exists: null, detail: body.error ?? "indeterminado" };
    }
    return { exists: body.exists };
  } catch (err) {
    clearTimeout(timer);
    return {
      exists: null,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 200);
  } catch {
    return "";
  }
}

// -------------------------------------------------------------------------
// Status / QR — usados por la UI admin para pareo manual
// -------------------------------------------------------------------------

export type BotStatus = {
  state: "starting" | "qr" | "ready" | "logged_out" | "error";
  pairedNumber?: string | null;
  lastError?: string | null;
};

export async function getBotStatus(): Promise<
  { ok: true; status: BotStatus } | { ok: false; error: string }
> {
  const url = (process.env.WHATSAPP_BOT_URL ?? "").trim();
  if (!url) return { ok: false, error: "WHATSAPP_BOT_URL vacia" };

  const token = (process.env.WHATSAPP_BOT_TOKEN ?? "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WA_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/status`, {
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `bot ${res.status}` };
    }
    const body = (await res.json()) as BotStatus;
    return { ok: true, status: body };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Devuelve el QR codificado en data URL (image/png base64) si el bot está
 * esperando pareo. Si no hay QR (ya pareado / error), devuelve null.
 */
export async function getBotQr(): Promise<
  | { ok: true; qrDataUrl: string | null }
  | { ok: false; error: string }
> {
  const url = (process.env.WHATSAPP_BOT_URL ?? "").trim();
  if (!url) return { ok: false, error: "WHATSAPP_BOT_URL vacia" };

  const token = (process.env.WHATSAPP_BOT_TOKEN ?? "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WA_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/qr`, {
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 404) {
      // sin QR pendiente (ready o error)
      return { ok: true, qrDataUrl: null };
    }
    if (!res.ok) {
      return { ok: false, error: `bot ${res.status}` };
    }
    const body = (await res.json()) as { qr: string | null };
    return { ok: true, qrDataUrl: body.qr ?? null };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
