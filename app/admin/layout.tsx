import type { ReactNode } from "react";

/**
 * Layout neutro para todo el segmento /admin (incluye /admin/login).
 * El gateo por sesión se hace dentro de cada subruta:
 *   - /admin/login: redirige a /admin si ya hay sesión
 *   - /admin (y subrutas autenticadas): viven bajo (authed)/layout.tsx
 *
 * Si más adelante hay segmentos públicos del admin, esto evita el clásico
 * loop de "estoy logueado pero la pantalla de login me redirige".
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
