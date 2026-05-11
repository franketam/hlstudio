import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { COPY } from "@/lib/constants";

export function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden"
      aria-labelledby="hero-title"
    >
      {/* Vignette cinematográfico */}
      <div aria-hidden className="vignette pointer-events-none absolute inset-0 z-0" />

      {/* Topbar interno */}
      <header className="container relative z-10 flex items-center justify-between pt-7 sm:pt-10">
        <Logo variant="light" width={88} priority />
        <p className="font-sans text-[10px] uppercase tracking-[0.32em] text-background/55">
          Chivilcoy · Buenos Aires
        </p>
      </header>

      {/* Contenedor del hero — alto cinematográfico */}
      <div className="container relative z-10 flex min-h-[calc(100dvh-80px)] flex-col justify-between pb-14 pt-20 sm:min-h-[calc(100dvh-100px)] sm:pb-20 sm:pt-32">
        {/* Headline + bajada */}
        <div className="hl-rise" style={{ animationDelay: "120ms" }}>
          <h1
            id="hero-title"
            className="display-tight font-display uppercase text-background"
            style={{
              fontSize: "clamp(3.25rem, 12.5vw, 13rem)",
              lineHeight: 0.92,
              letterSpacing: "-0.035em",
            }}
          >
            <span className="block font-light">Donde el corte</span>
            <span className="block italic font-normal">es oficio.</span>
          </h1>
        </div>

        {/* Bloque inferior — bajada + CTA + meta */}
        <div className="hl-rise mt-16 grid grid-cols-12 items-end gap-y-10 gap-x-6 sm:mt-24" style={{ animationDelay: "300ms" }}>
          <p className="col-span-12 max-w-md font-display text-lg italic leading-snug text-background/80 sm:col-span-5 sm:text-xl">
            Reservá tu turno online en menos de un minuto. Elegís servicio,
            barbero y horario.
          </p>

          <div className="col-span-12 flex flex-col items-start gap-5 sm:col-span-6 sm:col-start-7 sm:items-end">
            <Link
              href="/reservar"
              className="group inline-flex items-baseline gap-3 border-b border-background pb-2 font-display text-3xl text-background transition-[gap] duration-300 ease-out hover:gap-5 sm:text-4xl"
            >
              <span>{COPY.cta.reservarTurno}</span>
              <span
                aria-hidden
                className="text-2xl transition-transform duration-300 ease-out group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <p className="font-sans text-[10px] uppercase tracking-[0.32em] text-background/55">
              Martes a sábado · 10–13 / 15–20
            </p>
          </div>
        </div>
      </div>

      {/* Indicador de scroll ultra sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 sm:block"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="font-sans text-[9px] uppercase tracking-[0.4em] text-background/40">
            Continúa
          </span>
          <span aria-hidden className="block h-8 w-px bg-background/30" />
        </div>
      </div>
    </section>
  );
}
