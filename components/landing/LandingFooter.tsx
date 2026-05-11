import Link from "next/link";
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
        </div>
      </div>
    </footer>
  );
}
