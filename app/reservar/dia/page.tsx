import Link from "next/link";
import { redirect } from "next/navigation";
import { ProgressIndicator } from "@/components/reservar/ProgressIndicator";
import { ResumenReserva } from "@/components/reservar/ResumenReserva";
import {
  getBarberoPublico,
  getServicioConPrecio,
} from "@/server/queries/public";
import { getAvailableSlots, isDiaAbierto } from "@/lib/availability";
import {
  fechaLargaAR,
  proximosNDias,
  ymdLocal,
  formatDuracion,
} from "@/lib/format";

export const metadata = {
  title: "Elegir día y hora",
};

export const dynamic = "force-dynamic";

const DIAS_VENTANA = 14;

type SearchParams = Promise<{
  barbero?: string;
  servicio?: string;
  fecha?: string;
}>;

export default async function ReservarPaso3Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const barbero = sp.barbero;
  const servicio = sp.servicio;

  if (!barbero) redirect("/reservar");
  if (!servicio) redirect(`/reservar/servicio?barbero=${barbero}`);

  const [barberoData, servicioData] = await Promise.all([
    getBarberoPublico(barbero),
    getServicioConPrecio(servicio, barbero),
  ]);

  if (!barberoData) redirect("/reservar");
  if (!servicioData) redirect(`/reservar/servicio?barbero=${barbero}`);

  const dias = proximosNDias(DIAS_VENTANA);

  // Para cada día calculo si está abierto. Slots solo del día seleccionado
  // (evita N queries pesadas).
  const aperturaPorDia = await Promise.all(
    dias.map(async (d) => ({ ymd: d.ymd, abierto: await isDiaAbierto(d.ymd) }))
  );
  const aperturaMap = new Map(aperturaPorDia.map((a) => [a.ymd, a.abierto]));

  // Si el usuario no eligió fecha aún, arrancamos en el primer día con slots
  // (evita que aterricen en hoy con 0 slots porque ya cerramos).
  let fechaSeleccionada: string;
  let slots: Awaited<ReturnType<typeof getAvailableSlots>> = [];
  if (sp.fecha) {
    fechaSeleccionada = sp.fecha;
    slots = await getAvailableSlots({
      barberoId: barbero,
      servicioId: servicio,
      fecha: fechaSeleccionada,
    });
  } else {
    fechaSeleccionada = dias[0]?.ymd ?? ymdLocal(new Date());
    for (const d of dias) {
      if (!aperturaMap.get(d.ymd)) continue;
      const candidato = await getAvailableSlots({
        barberoId: barbero,
        servicioId: servicio,
        fecha: d.ymd,
      });
      if (candidato.length > 0) {
        fechaSeleccionada = d.ymd;
        slots = candidato;
        break;
      }
    }
  }

  const fechaLabel = fechaLargaAR(`${fechaSeleccionada}T12:00:00`);

  return (
    <div className="container max-w-2xl py-8">
      <ProgressIndicator paso={3} />

      <div className="mb-5">
        <Link
          href={{
            pathname: "/reservar/servicio",
            query: { barbero },
          }}
          className="text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="display-tight text-3xl sm:text-4xl">Elegí día y hora</h1>

      <div className="mt-6">
        <ResumenReserva
          barberoNombre={barberoData.nombre}
          servicioNombre={servicioData.nombre}
          duracionMin={servicioData.duracionMin}
          precio={servicioData.precio}
        />
      </div>

      {/* Tira de días */}
      <div className="mt-8">
        <p className="mb-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Próximos {DIAS_VENTANA} días
        </p>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
          {dias.map((d) => {
            const abierto = aperturaMap.get(d.ymd) === true;
            const seleccionado = d.ymd === fechaSeleccionada;
            const baseClasses =
              "flex min-w-[68px] snap-start flex-col items-center rounded-md border px-3 py-2.5 text-center transition-colors";
            const stateClasses = !abierto
              ? "cursor-not-allowed border-border bg-muted/30 text-muted-foreground/50"
              : seleccionado
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent";
            const inner = (
              <>
                <span className="text-[10px] uppercase tracking-[0.25em]">
                  {d.diaCorto}
                </span>
                <span className="numeral mt-1 text-xl font-medium">
                  {d.numero}
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em]">
                  {d.mesCorto}
                </span>
              </>
            );

            if (!abierto) {
              return (
                <div
                  key={d.ymd}
                  aria-disabled
                  className={`${baseClasses} ${stateClasses}`}
                >
                  {inner}
                </div>
              );
            }

            return (
              <Link
                key={d.ymd}
                href={{
                  pathname: "/reservar/dia",
                  query: { barbero, servicio, fecha: d.ymd },
                }}
                className={`${baseClasses} ${stateClasses}`}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Slots */}
      <div className="mt-8">
        <p className="mb-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {fechaLabel}
        </p>

        {aperturaMap.get(fechaSeleccionada) === false ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Cerrado este día. Elegí otro.
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Sin horarios disponibles. Probá con otro día.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <Link
                key={s.inicioTs.toISOString()}
                href={{
                  pathname: "/reservar/datos",
                  query: {
                    barbero,
                    servicio,
                    fecha: fechaSeleccionada,
                    inicio: s.inicioTs.toISOString(),
                  },
                }}
                className="numeral flex h-12 items-center justify-center rounded-md border border-border bg-card text-base font-medium hover:border-foreground/40 hover:bg-accent"
              >
                {s.slot}
              </Link>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Duración del turno: {formatDuracion(servicioData.duracionMin)}
        </p>
      </div>
    </div>
  );
}
