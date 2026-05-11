import { BarberoAvatar } from "@/components/brand/BarberoAvatar";

type Barbero = {
  numero: string;
  nombre: string;
};

const barberos: Barbero[] = [
  { numero: "01", nombre: "Hugo L." },
  { numero: "02", nombre: "Leonel B." },
];

export function Barberos() {
  return (
    <section
      className="relative bg-background text-foreground"
      aria-labelledby="barberos-title"
    >
      <div className="container py-28 sm:py-44">
        {/* Heading minimal centrado */}
        <h2
          id="barberos-title"
          className="display-tight mx-auto max-w-4xl text-center font-display font-light text-foreground"
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4.75rem)",
            lineHeight: 0.95,
            letterSpacing: "-0.035em",
          }}
        >
          Nuestro
          <span className="block italic">equipo.</span>
        </h2>

        {/* Dos retratos lado a lado, alineación editorial limpia */}
        <div className="mt-24 grid grid-cols-1 gap-y-24 sm:mt-36 sm:grid-cols-2 sm:gap-x-12">
          {barberos.map((b) => (
            <article
              key={b.numero}
              className="flex flex-col items-center text-center"
            >
              <BarberoAvatar
                nombre={b.nombre}
                size={280}
                tone="dark"
              />

              {/* /65 para garantizar contraste AA (>=4.5) en texto chico sobre #fafafa. */}
              <p className="mt-10 font-sans text-[10px] uppercase tracking-[0.4em] text-foreground/65">
                {b.numero}
              </p>
              <h3 className="mt-3 font-display text-3xl font-light tracking-tightest text-foreground sm:text-4xl">
                {b.nombre}
              </h3>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-20 max-w-md text-center text-sm leading-relaxed text-foreground/65 sm:mt-28 sm:text-base">
          Atendemos en paralelo, con agenda independiente. Elegí tu barbero al
          momento de reservar.
        </p>
      </div>
    </section>
  );
}
