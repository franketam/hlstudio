import { Hero } from "@/components/landing/Hero";
import { Manifiesto } from "@/components/landing/Manifiesto";
import { Carta } from "@/components/landing/Carta";
import { Barberos } from "@/components/landing/Barberos";
import { Visitanos } from "@/components/landing/Visitanos";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Landing pública — concepto "Cuarto Oscuro".
 * Cinematográfico, dark-dominant, ritmo dark→light→dark.
 * Server Component. Animación de entrada del hero via CSS keyframe.
 */
export default function HomePage() {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:text-foreground"
      >
        Saltar al contenido
      </a>

      {/* Grano cinematográfico — visible sobre fondos oscuros */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] grain-dark"
      />

      <main
        id="contenido"
        className="relative z-0 min-h-dvh bg-foreground text-background"
      >
        <Hero />
        <Manifiesto />
        <Carta />
        <Barberos />
        <Visitanos />
        <LandingFooter />
      </main>
    </>
  );
}
