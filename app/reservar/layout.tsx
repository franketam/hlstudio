import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

/**
 * Layout para todo el flujo de reserva (/reservar/...).
 *
 * Decisión estética: el flujo es un "modo funcional" — paleta clara, foco en
 * usabilidad. La estética cinematográfica vive en la landing.
 */
export default function ReservarLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border/60 bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" aria-label="Ir al inicio" className="flex items-center">
            <Logo width={120} className="h-10 w-auto" />
          </Link>
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
          >
            Salir
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
