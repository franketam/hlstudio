import Link from "next/link";
import { redirect } from "next/navigation";
import { ProgressIndicator } from "@/components/reservar/ProgressIndicator";
import { ResumenReserva } from "@/components/reservar/ResumenReserva";
import {
  getBarberoPublico,
  listServiciosConPrecioPorBarbero,
} from "@/server/queries/public";
import { formatDuracion, formatPrecioARS } from "@/lib/format";

export const metadata = {
  title: "Elegir servicio",
};

type SearchParams = Promise<{
  barbero?: string;
}>;

export default async function ReservarPaso2Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { barbero } = await searchParams;

  if (!barbero) {
    redirect("/reservar");
  }

  const barberoData = await getBarberoPublico(barbero);
  if (!barberoData) {
    redirect("/reservar");
  }

  const serviciosLista = await listServiciosConPrecioPorBarbero(barbero);

  return (
    <div className="container max-w-2xl py-8">
      <ProgressIndicator paso={2} />

      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/reservar"
          className="text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="display-tight text-3xl sm:text-4xl">Elegí el servicio</h1>
      <p className="mt-2 text-muted-foreground">
        Te atenderá <span className="font-medium text-foreground">{barberoData.nombre}</span>.
      </p>

      <div className="mt-6">
        <ResumenReserva barberoNombre={barberoData.nombre} />
      </div>

      {serviciosLista.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          Este barbero todavía no tiene servicios cargados.
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {serviciosLista.map((s) => (
            <li key={s.id}>
              <Link
                href={{
                  pathname: "/reservar/dia",
                  query: { barbero: barbero, servicio: s.id },
                }}
                className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/40 hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="font-display text-xl">{s.nombre}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatDuracion(s.duracionMin)}
                  </p>
                </div>
                <div className="numeral text-right text-base font-medium">
                  {formatPrecioARS(s.precio)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
