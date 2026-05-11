"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import {
  RATE_LIMITS,
  checkRateLimitForRoute,
  getClientIp,
} from "@/lib/rate-limit";
import { destroySession, getMutableSession } from "@/lib/session";

/**
 * Resultado tipado para server actions del admin.
 * Convención: { ok: true } | { ok: false, error: { code, message } }
 */
export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: { code: string; message: string } };

const loginSchema = z.object({
  email: z.string().trim().min(1, "Ingresá tu usuario."),
  password: z.string().min(1, "La contraseña es obligatoria."),
});

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  // Rate limit: 10 intentos por IP cada 15 min. Limita brute-force.
  const rl = await checkRateLimitForRoute(
    "login",
    RATE_LIMITS.LOGIN.limit,
    RATE_LIMITS.LOGIN.windowMs
  );
  if (!rl.ok) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Demasiados intentos. Probá en un rato.",
      },
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: first?.message ?? "Datos inválidos.",
      },
    };
  }

  const { email, password } = parsed.data;

  // Comparación case-insensitive del email; password contra hash en env.
  const emailMatch =
    email.trim().toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
  const passwordMatch = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);

  if (!emailMatch || !passwordMatch) {
    const ip = await getClientIp();
    console.warn(`[security] login_failure ip=${ip}`);
    // Mensaje genérico para no revelar cuál falló.
    return {
      ok: false,
      error: {
        code: "invalid_credentials",
        message: "Email o contraseña incorrectos.",
      },
    };
  }

  const session = await getMutableSession();
  session.isLoggedIn = true;
  session.email = env.ADMIN_EMAIL;
  session.loggedInAt = Date.now();
  await session.save();

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
