import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
  type WAMessage,
  type WAMessageUpdate,
  type MessageUserReceiptUpdate,
  type proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import { rm, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

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

// --- Watchdog ---------------------------------------------------------------
// Toda la lógica de reintento cuelga del evento `connection: "close"`. Si el
// WebSocket se cuelga SIN cerrar, ese evento nunca llega y el bot queda zombie:
// proceso vivo, /health en 200, el orquestador nunca lo reinicia. Pasó el
// 28-jul-2026 (WhatsApp cortó con 503, el relogin dio 405 y el intento
// siguiente quedó colgado 38h sin emitir una sola línea de log).
//
// El supervisor es un timer independiente de los eventos de baileys: si no hay
// progreso en la ventana, recicla el socket a mano.
const SUPERVISOR_TICK_MS = 30_000;

// Sin llegar a `ready` —ni refrescar el QR, ni reintentar— en esta ventana,
// damos el socket por colgado.
const NO_PROGRESS_TIMEOUT_MS = 90_000;

// El fetch de versión de WA es un `await` en el camino crítico del arranque y
// por defecto no tiene corte. Sin esto, un fetch colgado congela el arranque.
const VERSION_FETCH_TIMEOUT_MS = 10_000;

// Tras este tiempo sin estar operativo, /health pasa a 503 para que el
// orquestador reinicie el contenedor. Es la última red: el watchdog interno
// tiene que haber resuelto mucho antes.
const UNHEALTHY_AFTER_MS = 15 * 60_000;

// Nombres de proto.WebMessageInfo.Status, para loguear la progresión de
// entrega de forma legible. Si nunca llega a DELIVERY_ACK, el destinatario
// no lo recibió (queda en "Waiting for this message").
const STATUS_NAMES = [
  "ERROR",
  "PENDING",
  "SERVER_ACK",
  "DELIVERY_ACK",
  "READ",
  "PLAYED",
] as const;

function statusName(status: number | null | undefined): string {
  if (typeof status !== "number") return String(status);
  return STATUS_NAMES[status] ?? String(status);
}

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

  // --- Watchdog ---
  private supervisorTimer: NodeJS.Timeout | null = null;
  // Última señal de vida de la conexión: arranque, QR, open o close. NO se
  // actualiza sola con el paso del tiempo — si se congela, el supervisor actúa.
  private lastProgressAt = Date.now();
  private readonly bootedAt = Date.now();
  private lastReadyAt: number | null = null;
  // Invalida los handlers de sockets viejos. Un socket reciclado puede seguir
  // emitiendo eventos; sin esto pisaría el estado del socket nuevo.
  private generation = 0;
  private recycling = false;

  constructor(private readonly authDir: string) {}

  private markProgress(): void {
    this.lastProgressAt = Date.now();
  }

  async start(): Promise<void> {
    this.startSupervisor();
    if (this.starting) {
      logger.warn("start() llamado mientras ya estaba arrancando — ignoro");
      return;
    }
    this.starting = true;
    this.markProgress();
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

    // Todo handler de este socket queda atado a esta generación: si el
    // watchdog lo recicla, sus eventos tardíos se descartan.
    const gen = ++this.generation;

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    // La versión de WhatsApp Web cambia seguido; si Baileys usa la hardcoded
    // los servidores rechazan el handshake con 405. fetchLatestBaileysVersion
    // consulta el endpoint oficial en runtime.
    let waVersion: [number, number, number] | undefined;
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion({
        timeout: VERSION_FETCH_TIMEOUT_MS,
      });
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
        const found = id ? this.sentMessages.get(id) : undefined;
        // Si nos llaman acá es porque el destinatario no pudo descifrar y pidió
        // reenvío: señal directa del problema "Waiting for this message".
        logger.info(
          { msgId: id, remoteJid: key?.remoteJid, cacheHit: Boolean(found) },
          "[wa] retry: getMessage solicitado"
        );
        return found ?? undefined;
      },
    });

    this.sock = sock;
    this.markProgress();

    sock.ev.on("creds.update", async () => {
      // Un socket reciclado escribiendo creds pisaría las del socket vigente.
      if (gen !== this.generation) return;
      await saveCreds();
    });

    sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
      if (gen !== this.generation) return;
      // Cualquier evento de conexión cuenta como señal de vida, incluso un
      // error: significa que el socket sigue respondiendo.
      this.markProgress();

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
        this.lastReadyAt = Date.now();
        const me = sock.user?.id;
        this.pairedNumber = me ? me.split(":")[0] ?? null : null;
        logger.info({ user: this.pairedNumber }, "WhatsApp pareado y listo");
      }

      if (connection === "close") {
        const err = lastDisconnect?.error as Boom | undefined;
        const code = err?.output?.statusCode;
        const isLoggedOut = code === DisconnectReason.loggedOut;
        const isReplaced = code === DisconnectReason.connectionReplaced;
        const msg = err?.message ?? "desconocido";
        logger.warn({ code, isLoggedOut, isReplaced, msg }, "conexion cerrada");

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
        } else if (isReplaced) {
          // conflict (440): OTRA conexión tomó la sesión con las mismas
          // credenciales. Casi siempre = dos instancias del bot corriendo
          // contra el mismo AUTH_DIR (deploy solapado / réplica duplicada), o
          // el número abierto en otro WhatsApp Web. Reconectar a los 5s genera
          // un ping-pong infinito que CORROMPE el cifrado (de ahí los
          // "Waiting for this message"). Backoff largo para no pelear la sesión.
          this.state = "error";
          this.lastError =
            "conflict (440): otra instancia tomo la conexion. Verificar que NO haya dos bots con el mismo AUTH_DIR.";
          logger.error(
            "[wa] conflict/replaced (440): otra sesion tomo la conexion. " +
              "Probablemente hay DOS instancias del bot con las mismas credenciales. " +
              "Backoff 60s para no perpetuar el ping-pong."
          );
          this.scheduleReconnect(60_000);
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

    // Progresión de estado de los mensajes que mandamos. Es el indicador más
    // directo: si un mensaje no pasa de SERVER_ACK a DELIVERY_ACK, el
    // destinatario no lo recibió (se quedó en "Waiting for this message").
    sock.ev.on("messages.update", (updates: WAMessageUpdate[]) => {
      for (const u of updates) {
        if (typeof u.update?.status !== "number") continue;
        logger.info(
          {
            msgId: u.key?.id,
            remoteJid: u.key?.remoteJid,
            status: statusName(u.update?.status),
          },
          "[wa] messages.update"
        );
      }
    });

    // Recibos de entrega/lectura por destinatario.
    sock.ev.on("message-receipt.update", (updates: MessageUserReceiptUpdate[]) => {
      for (const u of updates) {
        logger.info(
          {
            msgId: u.key?.id,
            remoteJid: u.key?.remoteJid,
            userJid: u.receipt?.userJid,
            delivered: Boolean(u.receipt?.receiptTimestamp),
            read: Boolean(u.receipt?.readTimestamp),
          },
          "[wa] message-receipt.update"
        );
      }
    });
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.markProgress();
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

  /**
   * Timer independiente de los eventos de baileys. Es lo único que puede
   * rescatar al bot cuando el socket se cuelga sin emitir `close` — el modo de
   * falla que lo dejó 38h mudo el 28-jul-2026.
   */
  private startSupervisor(): void {
    if (this.supervisorTimer) return;
    this.supervisorTimer = setInterval(() => {
      void this.supervisorTick();
    }, SUPERVISOR_TICK_MS);
    // No debe mantener vivo el proceso por sí solo.
    this.supervisorTimer.unref?.();
    logger.info(
      { tickMs: SUPERVISOR_TICK_MS, timeoutMs: NO_PROGRESS_TIMEOUT_MS },
      "[wa] watchdog activo"
    );
  }

  private async supervisorTick(): Promise<void> {
    // Un reciclo puede tardar más que el tick; sin esto se pisarían.
    if (this.recycling) return;
    if (this.state === "ready") return;

    // `qr` refresca cada ~20s mientras el QR está vigente, así que sigue
    // marcando progreso: esperar a que un humano escanee no dispara el reciclo.
    const idleMs = Date.now() - this.lastProgressAt;
    if (idleMs < NO_PROGRESS_TIMEOUT_MS) return;

    logger.error(
      { state: this.state, idleMs, starting: this.starting },
      "[wa] watchdog: sin progreso, reciclando socket"
    );
    await this.forceRecycle();
  }

  /**
   * Descarta el socket actual y arranca uno nuevo, sin depender de que baileys
   * emita nada. Best-effort en cada paso: el socket puede estar en cualquier
   * estado, incluido a medio abrir.
   */
  private async forceRecycle(): Promise<void> {
    this.recycling = true;
    try {
      await this._forceRecycle();
    } finally {
      this.recycling = false;
    }
  }

  private async _forceRecycle(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Invalida los handlers del socket viejo antes de tocarlo.
    this.generation++;
    const dead = this.sock;
    this.sock = null;

    try {
      dead?.end(new Error("watchdog: socket sin progreso"));
    } catch (err) {
      logger.warn({ err }, "[wa] watchdog: fallo al cerrar el socket viejo");
    }
    try {
      dead?.ws?.close();
    } catch {
      // ya estaba cerrado o nunca llegó a abrir
    }

    // Si `_startInternal` nunca resolvió, `starting` quedó trabado en true y
    // todo `start()` posterior sería un no-op. Lo destrabamos a mano.
    this.starting = false;
    this.markProgress();

    try {
      await this.start();
    } catch (err) {
      logger.error({ err }, "[wa] watchdog: fallo el restart, reintento en 10s");
      this.state = "error";
      this.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleReconnect(10_000);
    }
  }

  getStatus(): BotPublicStatus {
    return {
      state: this.state,
      pairedNumber: this.pairedNumber,
      lastError: this.lastError,
    };
  }

  /**
   * Salud para el healthcheck del orquestador. Reporta 200 mientras el bot
   * pueda recuperarse solo; recién marca unhealthy cuando lleva
   * `UNHEALTHY_AFTER_MS` sin operar, para que Coolify reinicie el contenedor.
   *
   * `qr` nunca es unhealthy: ahí esperamos a que un humano escanee, puede
   * tardar horas y reiniciar borraría el QR vigente.
   */
  getHealth(): { ok: boolean; state: BotState; downMs: number } {
    const downMs =
      this.state === "ready" ? 0 : Date.now() - (this.lastReadyAt ?? this.bootedAt);
    const ok =
      this.state === "ready" || this.state === "qr" || downMs < UNHEALTHY_AFTER_MS;
    return { ok, state: this.state, downMs };
  }

  getQrDataUrl(): string | null {
    return this.qrDataUrl;
  }

  isReady(): boolean {
    return this.state === "ready" && this.sock !== null;
  }

  /**
   * Borra los archivos de sesión Signal del destinatario en AUTH_DIR, forzando
   * una renegociación fresca en el próximo envío. Es la mitigación al bug
   * "Waiting for this message": la sesión de cifrado se vuelve rancia (sobre
   * todo contra iOS) y el destinatario no puede descifrar.
   *
   * Solo toca `session-<user>.<device>.json` del número dado — NO creds,
   * prekeys, app-state ni sender-keys. Best-effort: loguea y nunca tira.
   */
  private async resetSession(digits: string): Promise<number> {
    const prefix = `session-${digits}.`;
    let deleted = 0;
    try {
      const files = await readdir(this.authDir);
      for (const f of files) {
        if (f.startsWith(prefix) && f.endsWith(".json")) {
          try {
            await unlink(join(this.authDir, f));
            deleted++;
          } catch {
            // ya no está / carrera con otro envío — ignorar
          }
        }
      }
    } catch (err) {
      logger.warn({ digits, err }, "[wa] resetSession: no se pudo leer AUTH_DIR");
      return 0;
    }
    if (deleted > 0) {
      logger.info({ digits, deleted }, "[wa] sesión limpiada, renegocia en el envío");
    }
    return deleted;
  }

  /** Reset manual de sesión por número (para el endpoint /reset-session). */
  async resetSessionFor(
    to: string
  ): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
    const digits = to.replace(/^\+/, "").replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, error: `numero invalido: ${to}` };
    }
    return { ok: true, deleted: await this.resetSession(digits) };
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
    let jid = `${digits}@s.whatsapp.net`;

    // Validar/normalizar contra WhatsApp: devuelve el JID canónico y, si aplica,
    // el LID (direccionamiento nuevo, sospechoso del bug "Waiting for this
    // message"). Best-effort: si falla, seguimos con el JID construido a mano.
    try {
      const results = await this.sock.onWhatsApp(jid);
      const hit = results?.[0];
      if (hit?.exists) {
        logger.info(
          { to: digits, canonical: hit.jid, lid: hit.lid ?? null },
          "[wa] onWhatsApp resuelto"
        );
        if (typeof hit.jid === "string" && hit.jid) jid = hit.jid;
      } else {
        logger.warn({ to: digits }, "[wa] onWhatsApp: numero sin cuenta de WhatsApp o sin resultado");
      }
    } catch (err) {
      logger.warn({ to: digits, err }, "[wa] onWhatsApp fallo, uso JID construido");
    }

    // Limpiar la sesión del destinatario antes de enviar: fuerza una
    // renegociación fresca y esquiva el bug de sesión rancia ("Waiting for
    // this message"). Costo trivial para el volumen de un local.
    await this.resetSession(digits);

    try {
      const res = await this.sock.sendMessage(jid, { text });
      const id = res?.key?.id;
      if (id && res?.message) {
        this.rememberSentMessage(id, res.message);
      }
      logger.info({ jid, msgId: id }, "[wa] sendMessage enviado");
      return { ok: true, messageId: id ?? null };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
