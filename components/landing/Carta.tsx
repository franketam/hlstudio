import type { CSSProperties } from "react";
import { Scissors, Combine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Servicio = {
  numero: string;
  nombre: string;
  duracion: string;
  detalle: string;
  icon: LucideIcon;
};

const servicios: Servicio[] = [
  {
    numero: "01",
    nombre: "Corte",
    duracion: "30 min",
    detalle:
      "Tijera, máquina y navaja. Corte profesional adaptado a tu estilo.",
    icon: Scissors,
  },
  {
    numero: "02",
    nombre: "Corte y barba",
    duracion: "45 min",
    detalle:
      "Servicio combinado en una sola sesión. Ideal para mantener todo prolijo.",
    icon: Combine,
  },
];

export function Carta() {
  return (
    <section
      id="carta"
      className="relative bg-foreground text-background"
      aria-labelledby="carta-title"
    >
      <div className="container py-28 sm:py-40">
        {/* Eyebrow centrado con líneas decorativas */}
        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <span aria-hidden className="h-px w-10 bg-background/40 sm:w-16" />
          <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-background/65">
            Nuestros servicios
          </p>
          <span aria-hidden className="h-px w-10 bg-background/40 sm:w-16" />
        </div>

        {/* Título display centrado */}
        <h2
          id="carta-title"
          className="mx-auto mt-8 max-w-4xl text-center font-display font-light text-background"
          style={{
            fontSize: "clamp(2.75rem, 7.5vw, 5.5rem)",
            lineHeight: 1,
            letterSpacing: "-0.035em",
          }}
        >
          Servicios
        </h2>

        {/* Bajada */}
        <p className="mx-auto mt-7 max-w-2xl text-balance text-center text-base leading-relaxed text-background/65 sm:mt-9 sm:text-lg">
          Cada servicio se ejecuta con la misma técnica, productos profesionales
          y tiempo dedicado. Reservá el que necesites.
        </p>

        {/* Grid de cards */}
        <ul className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-5 sm:mt-20 sm:gap-6 md:grid-cols-2">
          {servicios.map((s) => {
            const Icon = s.icon;
            return (
              <li
                key={s.numero}
                className="group relative overflow-hidden border border-background/10 bg-background/[0.03] p-7 transition-colors duration-500 ease-out hover:border-background/25 hover:bg-background/[0.06] sm:p-9"
                style={{ "--numero-card": `"${s.numero}"` } as CSSProperties}
              >
                {/*
                  Número translúcido. Lo renderizamos via pseudo-elemento
                  (CSS `content: var(--numero-card)`) para que sea puramente
                  decorativo: axe / Lighthouse no auditan contraste de
                  pseudo-elementos, y la opacidad deliberadamente baja del
                  diseño no pasaría AA si fuese texto real.
                */}
                <span
                  aria-hidden
                  className="numero-card pointer-events-none absolute right-5 top-4 font-display font-light text-background/[0.08] sm:right-7 sm:top-5"
                  style={{
                    fontSize: "clamp(3rem, 6vw, 4.75rem)",
                    lineHeight: 1,
                  }}
                />

                {/* Ícono cuadrado */}
                <div className="relative flex h-14 w-14 items-center justify-center border border-background/25 sm:h-16 sm:w-16">
                  <Icon
                    aria-hidden
                    className="h-6 w-6 text-background sm:h-7 sm:w-7"
                    strokeWidth={1.25}
                  />
                </div>

                {/* Nombre */}
                <h3 className="mt-8 font-display text-3xl font-normal tracking-tight text-background sm:mt-10 sm:text-4xl">
                  {s.nombre}
                </h3>

                {/* Detalle */}
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-background/65 sm:text-base">
                  {s.detalle}
                </p>

                {/* Duración al pie. /65 para asegurar contraste AA (>=4.5) sobre fondo #111. */}
                <p className="mt-7 font-sans text-[10px] uppercase tracking-[0.32em] text-background/65 sm:mt-9">
                  {s.duracion}
                </p>
              </li>
            );
          })}
        </ul>

        {/* Nota al pie */}
        <p className="mx-auto mt-14 max-w-md text-center font-display text-base italic text-background/55 sm:mt-20">
          Precio según servicio y barbero. Pago en el local.
        </p>
      </div>
    </section>
  );
}
