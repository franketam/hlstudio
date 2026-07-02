import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/brand/Logo";
import { APP_NAME } from "@/lib/constants";

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative bg-foreground text-background">
      {/* Hairline superior */}
      <div className="container">
        <div aria-hidden className="h-px bg-background/15" />
      </div>

      <div className="container flex flex-col items-center gap-10 py-16 sm:flex-row sm:items-end sm:justify-between sm:gap-12 sm:py-20">
        <Logo variant="light" width={84} />

        <div className="flex flex-col items-center gap-2 text-center sm:items-end sm:text-right">
          <p className="font-sans text-[10px] uppercase tracking-[0.32em] text-background/55">
            © {year} · {APP_NAME}
          </p>
          <Link
            href="/admin/login"
            className="font-sans text-[10px] uppercase tracking-[0.32em] text-background/55 underline-offset-4 transition-colors hover:text-background hover:underline"
          >
            Acceso staff
          </Link>
          <a
            href="https://www.venturebyte.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Desarrollado por VentureByte"
            className="mt-4 inline-flex items-center justify-center gap-2 text-xs text-background/45 transition-colors hover:text-background/70"
          >
            Desarrollado por VentureByte
            <Image
              src="/venturebyte-white.png"
              alt="VentureByte"
              width={20}
              height={20}
              className="h-5 w-auto opacity-70 transition-opacity hover:opacity-100"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
