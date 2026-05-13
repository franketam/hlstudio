"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COPY } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  {
    href: "/admin",
    label: COPY.admin.nav.panel,
    match: (p) => p === "/admin",
  },
  {
    href: "/admin/agenda",
    label: COPY.admin.nav.agenda,
    match: (p) => p.startsWith("/admin/agenda"),
  },
  {
    href: "/admin/clientes",
    label: COPY.admin.nav.clientes,
    match: (p) => p.startsWith("/admin/clientes"),
  },
  {
    href: "/admin/config",
    label: COPY.admin.nav.configuracion,
    match: (p) => p.startsWith("/admin/config"),
  },
  {
    href: "/admin/whatsapp",
    label: COPY.admin.nav.whatsapp,
    match: (p) => p.startsWith("/admin/whatsapp"),
  },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Navegación del panel" className="flex items-center gap-1">
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
