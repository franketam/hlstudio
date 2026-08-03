import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import pino from "pino";
import path from "node:path";
import { WhatsAppBot } from "./bot.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// libsignal narra cada renegociación de sesión pasándole el SessionEntry
// entero a console.info/console.warn (`session_record.js:301`,
// `session_builder.js:74`). Node expande ese objeto a ~25 líneas de claves,
// ratchets y buffers. Con el volumen real del local son ~135k líneas cada 6h:
// el buffer de docker rota y se pierde la historia justo cuando hace falta para
// diagnosticar. La librería no acepta un logger, así que filtramos por prefijo.
// LIBSIGNAL_VERBOSE=1 lo devuelve todo si hay que depurar cifrado.
const LIBSIGNAL_NOISE = [
  "Removing old closed session",
  "Closing open session in favor of incoming prekey bundle",
  "Closing session open",
];

if (process.env.LIBSIGNAL_VERBOSE !== "1") {
  const isNoise = (args: unknown[]): boolean =>
    typeof args[0] === "string" &&
    LIBSIGNAL_NOISE.some((prefix) => (args[0] as string).startsWith(prefix));

  for (const method of ["info", "warn", "log"] as const) {
    const passthrough = console[method].bind(console);
    console[method] = (...args: unknown[]): void => {
      if (isNoise(args)) return;
      passthrough(...args);
    };
  }
}

const PORT = Number(process.env.PORT ?? "3001");
const AUTH_DIR = process.env.AUTH_DIR ?? path.resolve("./.auth");
const TOKEN = (process.env.WHATSAPP_BOT_TOKEN ?? "").trim();

const bot = new WhatsAppBot(AUTH_DIR);

const app = express();
app.use(express.json({ limit: "100kb" }));

// --- Auth middleware (solo si TOKEN está seteado) ---
function authGuard(req: Request, res: Response, next: NextFunction): void {
  if (!TOKEN) {
    // Sin token configurado: el bot acepta cualquier request. Útil en dev
    // donde el bot vive en localhost. En prod, configurar siempre TOKEN.
    next();
    return;
  }
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${TOKEN}`;
  if (header !== expected) {
    res.status(401).json({ ok: false, error: "no autorizado" });
    return;
  }
  next();
}

// --- Routes ---

// Health: NO requiere auth (para Coolify healthcheck).
//
// Antes devolvía 200 incondicionalmente: mientras Express respondiera, el bot
// figuraba sano aunque el socket de WhatsApp estuviera muerto. Así pasó
// desapercibido el freeze del 28-jul-2026. Ahora refleja el estado real.
app.get("/health", (_req, res) => {
  const health = bot.getHealth();
  res.status(health.ok ? 200 : 503).json(health);
});

app.get("/status", authGuard, (_req, res) => {
  res.json(bot.getStatus());
});

app.get("/qr", authGuard, (_req, res) => {
  const qr = bot.getQrDataUrl();
  if (!qr) {
    res.status(404).json({ qr: null });
    return;
  }
  res.json({ qr });
});

app.post("/send", authGuard, async (req, res) => {
  const body = req.body as { to?: unknown; text?: unknown };

  if (typeof body.to !== "string" || typeof body.text !== "string") {
    res.status(400).json({ ok: false, error: "body invalido: to y text requeridos" });
    return;
  }
  if (body.text.length === 0 || body.text.length > 4096) {
    res.status(400).json({ ok: false, error: "text fuera de rango (1..4096)" });
    return;
  }

  if (!bot.isReady()) {
    res.status(503).json({ ok: false, error: "bot no esta pareado" });
    return;
  }

  const r = await bot.sendText(body.to, body.text);
  if (r.ok) {
    res.json({ ok: true, messageId: r.messageId });
  } else {
    res.status(500).json({ ok: false, error: r.error });
  }
});

// Reset manual de la sesión de cifrado de un número. Fuerza renegociación
// fresca en el próximo envío (mitigación "Waiting for this message").
app.post("/reset-session", authGuard, async (req, res) => {
  const body = req.body as { to?: unknown };
  if (typeof body.to !== "string") {
    res.status(400).json({ ok: false, error: "body invalido: to requerido" });
    return;
  }
  const r = await bot.resetSessionFor(body.to);
  if (r.ok) {
    res.json({ ok: true, deleted: r.deleted });
  } else {
    res.status(400).json({ ok: false, error: r.error });
  }
});

// Manejo de errores: log + 500 genérico, no leakear stack.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "uncaught express error");
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: "internal_error" });
});

// --- Boot ---
async function main(): Promise<void> {
  logger.info(
    { port: PORT, authDir: AUTH_DIR, tokenConfigured: TOKEN.length > 0 },
    "iniciando hlstudio-whatsapp-bot"
  );
  await bot.start();
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`escuchando en :${PORT}`);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "boot fatal");
  process.exit(1);
});
