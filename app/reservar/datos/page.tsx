import Link from "next/link";
import { redirect } from "next/navigation";
import { ProgressIndicator } from "@/components/reservar/ProgressIndicator";
import { ResumenReserva } from "@/components/reservar/ResumenReserva";
import {
  getBarberoPublico,
  getServicioConPrecio,
} from "@/server/queries/public";
import {
  fechaLargaAR,
  formatDuracion,
  horaCortaAR,
} from "@/lib/format";
import { DatosForm } from "@/app/reservar/datos/DatosForm";

export const metadata = {
  title: "Tus datos",
};

type SearchParams = Promise<{
  barbero?: string;
  servicio?: string;
  fecha?: string;
  inicio?: string;
}>;

export default async function ReservarPaso4Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { barbero, servicio, fecha, inicio } = sp;

  if (!barbero) redirect("/reservar");
  if (!servicio) redirect(`/reservar/servicio?barbero=${barbero}`);
  if (!fecha || !inicio) {
    redirect(`/reservar/dia?barbero=${barbero}&servicio=${servicio}`);
  }

  const inicioDate = new Date(inicio);
  if (Number.isNaN(inicioDate.getTime())) {
    redirect(`/reservar/dia?barbero=${barbero}&servicio=${servicio}`);
  }

  const [barberoData, servicioData] = await Promise.all([
    getBarberoPublico(barbero),
    getServicioConPrecio(servicio, barbero),
  ]);

  if (!barberoData) redirect("/reservar");
  if (!servicioData) redirect(`/reservar/servicio?barbero=${barbero}`);

  const fechaLabel = fechaLargaAR(inicioDate);
  const horaLabel = horaCortaAR(inicioDate);

  return (
    <div className="container max-w-xl py-8">
      <ProgressIndicator paso={4} />

      <div className="mb-5">
        <Link
          href={{
            pathname: "/reservar/dia",
            query: { barbero, servicio, fecha },
          }}
          className="text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="display-tight text-3xl sm:text-4xl">Tus datos</h1>
      <p className="mt-2 text-muted-foreground">
        Para confirmar el turno y reconocerte si volvés.
      </p>

      <div className="mt-6">
        <ResumenReserva
          barberoNombre={barberoData.nombre}
          servicioNombre={servicioData.nombre}
          duracionMin={servicioData.duracionMin}
          precio={servicioData.precio}
          fechaLabel={fechaLabel}
          horaLabel={horaLabel}
        />
      </div>

      <div className="mt-6">
        <DatosForm
          barberoId={barbero}
          servicioId={servicio}
          inicioIso={inicioDate.toISOString()}
        />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Pago en el local. Duración del turno {formatDuracion(servicioData.duracionMin)}.
      </p>
    </div>
  );
}
