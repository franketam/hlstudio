import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  barberos,
  clientes,
  servicios,
  turnos,
} from "@/db/schema";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { verifyCancelToken } from "@/lib/cancel-token";
import {
  fechaLargaAR,
  formatDuracion,
  formatPrecioARS,
  horaCortaAR,
} from "@/lib/format";
import { CancelarTurnoButton } from "@/app/turno/[token]/CancelarTurnoButton";

export const metadata = {
  title: "Tu turno",
};

const VENTANA_CANCEL_HORAS = 3;

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ nuevo?: string }>;

export default async function TurnoPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = await params;
  const { nuevo } = await searchParams;

  const parsed = verifyCancelToken(decodeURIComponent(token));
  if (!parsed) notFound();

  const [row] = await db
    .select({
      id: turnos.id,
      inicioTs: turnos.inicioTs,
      finTs: turnos.finTs,
      estado: turnos.estado,
      precioTotal: turnos.precioTotal,
      barberoNombre: barberos.nombre,
      servicioNombre: servicios.nombre,
      duracionMin: servicios.duracionMin,
      clienteNombre: clientes.nombre,
    })
    .from(turnos)
    .innerJoin(barberos, eq(barberos.id, turnos.barberoId))
    .innerJoin(servicios, eq(servicios.id, turnos.servicioId))
    .innerJoin(clientes, eq(clientes.id, turnos.clienteId))
    .where(eq(turnos.id, parsed.turnoId))
    .limit(1);

  if (!row) notFound();

  const cancelado =
    row.estado === "cancelado_cliente" || row.estado === "cancelado_admin";

  const ahora = Date.now();
  const ventanaMs = VENTANA_CANCEL_HORAS * 60 * 60 * 1000;
  const dentroDeVentana = row.inicioTs.getTime() - ahora >= ventanaMs;
  const puedeCancelar = !cancelado && dentroDeVentana && row.estado === "confirmado";

  const esRecienConfirmado = nuevo === "1" && row.estado === "confirmado";

  return (
    <div className="container max-w-xl py-10">
      <div className="mb-6 flex items-center gap-3">
        <Logo width={84} />
        <span className="font-display text-base">HLstudio</span>
      </div>

      {esRecienConfirmado ? (
        <div
          role="status"
          className="mb-6 rounded-md border border-foreground/20 bg-accent p-4 text-sm"
        >
          <p className="font-medium">Turno confirmado.</p>
          <p className="mt-1 text-muted-foreground">
            Guardá este link, te sirve para gestionar tu turno.
          </p>
        </div>
      ) : null}

      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Tu turno
      </p>
      <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
        Hola {row.clienteNombre.split(" ")[0]}
      </h1>

      <div className="mt-6 rounded-md border border-border bg-card p-5">
        <dl className="space-y-3 text-sm">
          <Row label="Servicio" value={`${row.servicioNombre} · ${formatDuracion(row.duracionMin)}`} />
          <Row label="Barbero" value={row.barberoNombre} />
          <Row label="Día" value={fechaLargaAR(row.inicioTs)} />
          <Row label="Hora" value={horaCortaAR(row.inicioTs)} />
          <Row label="Precio" value={formatPrecioARS(row.precioTotal)} />
          <Row label="Pago" value="En el local" />
          <Row label="Dirección" value="Chivilcoy" />
        </dl>
      </div>

      <div className="mt-6 space-y-3">
        {cancelado ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Este turno fue cancelado.
          </div>
        ) : puedeCancelar ? (
          <>
            <CancelarTurnoButton token={token} />
            <p className="text-xs text-muted-foreground">
              Podés cancelar online hasta 3 horas antes del turno.
            </p>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No podés cancelar online con menos de 3 horas. Comunicate con el barbero.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/">Volver al inicio</Link>
          </Button>
          {!cancelado ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/reservar">Reservar otro turno</Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/reservar">Reservar otro turno</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
