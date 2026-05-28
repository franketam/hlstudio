import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
  type WAMessage,
  type proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import { rm } from "node:fs/promises";

/**
 * Wrapper de Baileys con estado en memoria para la API HTTP.
 *
 * Estados:
 *   - "starting": conectando por primera vez
 *   - "qr": esperando pareo del admin (QR vigente disponible)
 *   - "ready": logueado y operativo
 *   - "logged_out": expulsado del lado de WhatsApp (la sesión murió)
 *   - "error": fallo recuperable, va a reintentar
 *
 * Auto-clean: si recibimos `loggedOut`, borramos el directorio de credenciales
 * y reiniciamos. Esto fuerza un QR nuevo y deja todo en blanco — el admin
 * tiene que volver a parear desde /admin/whatsapp.
 */

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// Cuántos mensajes enviados retenemos para responder pedidos de reintento.
// Cuando un destinatario no puede descifrar (sesión desincronizada, típico en
// iOS), WhatsApp pide reenvío y baileys nos llama `getMessage(key)`. Si no lo
// tenemos cacheado, el destinatario queda en "Waiting for this message".
const SENT_CACHE_MAX = 1_000;

export type BotState = "starting" | "qr" | "ready" | "logged_out" | "error";

export type BotPublicStatus = {
  state: BotState;
  pairedNumber: string | null;
  lastError: string | null;
};

export class WhatsAppBot {
  private sock: WASocket | null = null;
  private state: BotState = "starting";
  private qrDataUrl: string | null = null;
  private pairedNumber: string | null = null;
  private lastError: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private starting = false;
  // messageId -> contenido proto, para responder pedidos de reintento.
  private readonly sentMessages = new Map<string, proto.IMessage>();

  constructor(private readonly authDir: string) {}

  async start(): Promise<void> {
    if (this.starting) {
      logger.warn("start() llamado mientras ya estaba arrancando — ignoro");
      return;
    }
    this.starting = true;
    try {
      await this._startInternal();
    } finally {
      this.starting = false;
    }
  }

  private async _startInternal(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    // La versión de WhatsApp Web cambia seguido; si Baileys usa la hardcoded
    // los servidores rechazan el handshake con 405. fetchLatestBaileysVersion
    // consulta el endpoint oficial en runtime.
    let waVersion: [number, number, number] | undefined;
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      waVersion = version;
      logger.info({ version, isLatest }, "wa version resuelta");
    } catch (err) {
      logger.warn({ err }, "no se pudo fetchear la version de WA, usando default de baileys");
    }

    const sock = makeWASocket({
      auth: state,
      version: waVersion,
      printQRInTerminal: false,
      browser: Browsers.macOS("HLstudio-Bot"),
      logger: logger.child({ mod: "baileys" }) as unknown as pino.Logger,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      // Reenvío en respuesta a "retry receipts". Sin esto, un destinatario que
      // no pudo descifrar queda trabado en "Waiting for this message".
      getMessage: async (key) => {
        const id = key?.id;
        return (id ? this.sentMessages.get(id) : undefined) ?? undefined;
      },
    });

    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
          this.state = "qr";
          this.lastError = null;
          logger.info("QR generado, esperando pareo");
        } catch (err) {
          logger.error({ err }, "no se pudo codificar QR a dataURL");
        }
      }

      if (connection === "open") {
        this.state = "ready";
        this.qrDataUrl = null;
        this.lastError = null;
        const me = sock.user?.id;
        this.pairedNumber = me ? me.split(":")[0] ?? null : null;
        logger.info({ user: this.pairedNumber }, "WhatsApp pareado y listo");
      }

      if (connection === "close") {
        const err = lastDisconnect?.error as Boom | undefined;
        const code = err?.output?.statusCode;
        const isLoggedOut = code === DisconnectReason.loggedOut;
        const msg = err?.message ?? "desconocido";
        logger.warn({ code, isLoggedOut, msg }, "conexion cerrada");

        this.qrDataUrl = null;

        if (isLoggedOut) {
          this.state = "logged_out";
          this.lastError = "sesion expulsada, requiere re-pairing";
          logger.warn("[wa] sesion expulsada, requiere re-pairing");
          // Limpiar AUTH_DIR para que el próximo start() muestre QR nuevo.
          try {
            await rm(this.authDir, { recursive: true, force: true });
            logger.info({ dir: this.authDir }, "AUTH_DIR limpiado");
          } catch (rmErr) {
            logger.error({ err: rmErr }, "no se pudo limpiar AUTH_DIR");
          }
          // Reintentar después de un tick para mostrar QR de nuevo.
          this.scheduleReconnect(2_000);
        } else {
          // Reintento estándar con backoff suave.
          this.state = "error";
          this.lastError = `conexion caida (${code}): ${msg}`;
          this.scheduleReconnect(5_000);
        }
      }
    });

    // No usamos los mensajes entrantes, pero registramos el handler para que
    // baileys no buffer-ee indefinidamente.
    sock.ev.on("messages.upsert", (m: { messages: WAMessage[] }) => {
      // No-op intencional. Si se quiere agregar respuestas automáticas, va acá.
      logger.debug({ count: m.messages.length }, "messages.upsert");
    });
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      logger.info("reintentando conexion...");
      try {
        await this.start();
      } catch (err) {
        logger.error({ err }, "fallo el reintento de conexion");
        this.state = "error";
        this.lastError = err instanceof Error ? err.message : String(err);
        this.scheduleReconnect(10_000);
      }
    }, delayMs);
  }

  getStatus(): BotPublicStatus {
    return {
      state: this.state,
      pairedNumber: this.pairedNumber,
      lastError: this.lastError,
    };
  }

  getQrDataUrl(): string | null {
    return this.qrDataUrl;
  }

  isReady(): boolean {
    return this.state === "ready" && this.sock !== null;
  }

  private rememberSentMessage(id: string, message: proto.IMessage): void {
    if (this.sentMessages.size >= SENT_CACHE_MAX) {
      const oldest = this.sentMessages.keys().next().value;
      if (oldest !== undefined) this.sentMessages.delete(oldest);
    }
    this.sentMessages.set(id, message);
  }

  async sendText(
    to: string,
    text: string
  ): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
    if (!this.isReady() || !this.sock) {
      return { ok: false, error: "bot no esta pareado" };
    }

    // Normalizar a JID: WhatsApp espera "<digits>@s.whatsapp.net" para 1-a-1.
    const digits = to.replace(/^\+/, "").replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, error: `numero invalido: ${to}` };
    }
    const jid = `${digits}@s.whatsapp.net`;

    try {
      const res = await this.sock.sendMessage(jid, { text });
      const id = res?.key?.id;
      if (id && res?.message) {
        this.rememberSentMessage(id, res.message);
      }
      return { ok: true, messageId: id ?? null };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
