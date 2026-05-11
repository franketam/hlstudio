/**
 * Sección de respiro — fondo claro insertado entre dos bloques oscuros.
 * Manifiesto breve, italic, centrado. Crea ritmo cinematográfico.
 */
export function Manifiesto() {
  return (
    <section
      className="relative bg-background text-foreground"
      aria-labelledby="manifiesto-title"
    >
      <div className="container py-32 sm:py-48">
        <h2 id="manifiesto-title" className="sr-only">
          Manifiesto
        </h2>

        <p
          className="mx-auto max-w-4xl text-balance text-center font-display font-light text-foreground"
          style={{
            fontSize: "clamp(1.85rem, 5.5vw, 4.25rem)",
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
          }}
        >
          Turno online
          <span className="block italic">sin llamadas.</span>
        </p>

        <p className="mx-auto mt-10 max-w-md text-center text-base leading-relaxed text-foreground/65 sm:mt-14 sm:text-lg">
          Elegí día y horario, confirmá por email y listo. Sin esperas, sin
          idas y vueltas.
        </p>
      </div>
    </section>
  );
}
