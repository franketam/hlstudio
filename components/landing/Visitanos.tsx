import Link from "next/link";
import { COPY } from "@/lib/constants";

export function Visitanos() {
  return (
    <section
      id="visitanos"
      className="relative bg-foreground text-background"
      aria-labelledby="visitanos-title"
    >
      <div className="container flex flex-col items-center py-32 text-center sm:py-48">
        <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-background/55">
          Visitanos
        </p>

        <h2
          id="visitanos-title"
          className="display-tight mt-6 max-w-4xl font-display font-light text-background sm:mt-8"
          style={{
            fontSize: "clamp(2.5rem, 6.5vw, 5rem)",
            lineHeight: 0.95,
            letterSpacing: "-0.035em",
          }}
        >
          Te esperamos
          <span className="block italic">en Chivilcoy.</span>
        </h2>

        <div className="mt-16 flex flex-col items-center gap-7 sm:mt-20">
          <p className="font-display text-xl font-light leading-relaxed text-background/85 sm:text-2xl">
            Martes a sábado
          </p>
          <p className="font-display font-light leading-tight text-background sm:text-3xl" style={{ fontSize: "clamp(1.65rem, 3.5vw, 2.25rem)" }}>
            10:00 — 13:00
            <span className="mx-3 text-background/40">·</span>
            15:00 — 20:00
          </p>
          <p className="font-sans text-[11px] uppercase tracking-[0.32em] text-background/50">
            Cerrado domingos y lunes
          </p>
        </div>

        {/* CTA final */}
        <div className="mt-20 flex flex-col items-center gap-5 sm:mt-24">
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
        </div>
      </div>
    </section>
  );
}
