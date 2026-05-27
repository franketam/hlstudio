import { z } from "zod";

/**
 * Validación de variables de entorno al arrancar la app.
 * Si falta algo crítico, la app no inicia y se imprime qué falta.
 *
 * Server-only. No importar desde Client Components.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL es requerida")
    .url("DATABASE_URL debe ser una URL válida (postgresql://...)"),

  // ADMIN_EMAIL acepta cualquier identificador no vacío — email, usuario plano,
  // lo que se elija como login del admin. La validación dura del formato la
  // movimos al server action si hace falta.
  ADMIN_EMAIL: z.string().min(1, "ADMIN_EMAIL no puede estar vacío"),
  // ADMIN_PASSWORD: plaintext en MVP (un solo admin, env vars privadas).
  // Cuando escalemos a multi-usuario migramos a tabla `usuarios` + hashing.
  // El hash scrypt original se sacó porque su formato `scrypt$x$y` chocaba
  // con la interpolación de `$` de @next/env y rompía el login.
  ADMIN_PASSWORD: z
    .string()
    .min(1, "ADMIN_PASSWORD no puede estar vacío"),

  SESSION_PASSWORD: z
    .string()
    .min(32, "SESSION_PASSWORD debe tener al menos 32 caracteres"),

  CANCEL_TOKEN_SECRET: z
    .string()
    .min(32, "CANCEL_TOKEN_SECRET debe tener al menos 32 caracteres"),

  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_FROM_EMAIL: z
    .string()
    .email()
    .optional()
    .default("onboarding@resend.dev"),
  RESEND_FROM_NAME: z.string().optional().default("HLstudio"),

  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3000"),

  TIMEZONE: z.string().optional().default("America/Argentina/Buenos_Aires"),

  // --- WhatsApp bot (servicio interno Baileys) ---
  // URL del bot (http://localhost:3001 en dev, http://hlstudio-wa-bot:3001 en compose).
  // Si está vacía, la app NO intenta enviar WhatsApp y cae al fallback email.
  WHATSAPP_BOT_URL: z.string().optional().default(""),
  // Bearer token compartido entre app y bot. Opcional en dev (el bot lo exige solo si
  // está seteado de su lado). Recomendado >= 32 chars en prod.
  WHATSAPP_BOT_TOKEN: z.string().optional().default(""),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .optional()
    .default("development"),
});

type EnvData = z.infer<typeof envSchema>;

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

function parseEnv(): EnvData {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    if (IS_BUILD) {
      // During `next build`, env vars may be incomplete (placeholders in Docker,
      // or missing locally). Don't crash — the real values are injected at runtime.
      return {
        DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build",
        ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "build@example.com",
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "build",
        SESSION_PASSWORD: process.env.SESSION_PASSWORD ?? "a".repeat(32),
        CANCEL_TOKEN_SECRET: process.env.CANCEL_TOKEN_SECRET ?? "a".repeat(32),
        RESEND_API_KEY: "",
        RESEND_FROM_EMAIL: "onboarding@resend.dev",
        RESEND_FROM_NAME: "HLstudio",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        TIMEZONE: "America/Argentina/Buenos_Aires",
        WHATSAPP_BOT_URL: "",
        WHATSAPP_BOT_TOKEN: "",
        NODE_ENV: "production",
      };
    }
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(
      `\n[env] Variables de entorno inválidas o faltantes:\n${issues}\n`
    );
    throw new Error("Configuración de entorno inválida — revisá .env.local");
  }
  return parsed.data;
}

let _cached: EnvData | undefined;

export const env: EnvData = new Proxy({} as EnvData, {
  get(_, prop: string) {
    if (!_cached) _cached = parseEnv();
    return _cached[prop as keyof EnvData];
  },
});

export type Env = EnvData;
