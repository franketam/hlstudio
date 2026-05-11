import "server-only";

import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { env } from "@/lib/env";

/**
 * Sesión del admin (MVP: usuario único).
 * No hay tabla `User` — las credenciales viven en variables de entorno.
 * Si en v2 hay multi-admin, migramos a tabla y este shape sigue compatible.
 */
export type AdminSession = {
  isLoggedIn: boolean;
  email?: string;
  loggedInAt?: number; // epoch ms
};

const SESSION_COOKIE_NAME = "hlstudio_admin_session";

export const sessionOptions: SessionOptions = {
  password: env.SESSION_PASSWORD,
  cookieName: SESSION_COOKIE_NAME,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    // 30 días. Para un panel admin de barbería es razonable.
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession(): Promise<AdminSession> {
  const cookieStore = await cookies();
  const session = await getIronSession<AdminSession>(
    cookieStore,
    sessionOptions
  );
  // Default vacío si no hay cookie o está mal firmada.
  return {
    isLoggedIn: session.isLoggedIn ?? false,
    email: session.email,
    loggedInAt: session.loggedInAt,
  };
}

export async function getMutableSession() {
  const cookieStore = await cookies();
  return getIronSession<AdminSession>(cookieStore, sessionOptions);
}

export async function destroySession() {
  const session = await getMutableSession();
  session.destroy();
}
