import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  calcularMetricas,
  getClienteByIdConHistorial,
} from "@/server/queries/admin-clientes";
import { COPY } from "@/lib/constants";
import {
  fechaCortaAR,
  fechaLargaAR,
  formatDuracion,
  formatPrecioARS,
  horaCortaAR,
} from "@/lib/format";
import { TurnoEstadoBadge } from "@/components/admin/TurnoEstadoBadge";
import { NotasClienteForm } from "../NotasClienteForm";

export const metadata = {
  title: "Ficha de cliente",
};

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function ClienteDetallePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  // Si el id no es un UUID válido, devolvemos 404 sin tocar BD.
  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const cliente = await getClienteByIdConHistorial(id);
  if (!cliente) {
    notFound();
  }

  const metricas = calcularMetricas(cliente.turnos);

  return (
    <div className="container py-8">
      <div className="mb-4">
        <Link
          href="/admin/clientes"
          className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          {COPY.admin.clientes.volverAListado}
        </Link>
      </div>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {COPY.admin.clientes.title}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {cliente.nombre}
        </h1>
        <dl className="mt-3 grid gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
          <dt className="text-muted-foreground">Teléfono</dt>
          <dd className="numeral">{cliente.telefono}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>
            {cliente.email ? (
              <a
                href={`mailto:${cliente.email}`}
                className="hover:underline"
              >
                {cliente.email}
              </a>
            ) : (
              <span className="italic text-muted-foreground">
                {COPY.admin.clientes.sinEmail}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">
            {COPY.admin.clientes.clienteDesde}
          </dt>
          <dd>{fechaLargaAR(cliente.createdAt)}</dd>
        </dl>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={COPY.admin.clientes.totalTurnos}
          value={String(metricas.totalTurnos)}
          hint={
            metricas.totalVisitas !== metricas.totalTurnos
              ? `${metricas.totalVisitas} visitas / ${
                  metricas.totalTurnos - metricas.totalVisitas
                } canceladas`
              : undefined
          }
        />
        <MetricCard
          label={COPY.admin.clientes.ultimaVisita}
          value={
            metricas.ultimaVisita
              ? fechaCortaAR(metricas.ultimaVisita)
              : COPY.admin.clientes.sinUltimaVisita
          }
        />
        <MetricCard
          label={COPY.admin.clientes.frecuencia}
          value={
            metricas.frecuenciaDias === null
              ? COPY.admin.clientes.frecuenciaUnica
              : COPY.admin.clientes.frecuenciaDias(metricas.frecuenciaDias)
          }
        />
        <MetricCard
          label={COPY.admin.clientes.gastoTotal}
          value={formatPrecioARS(metricas.gastoTotal)}
          numeral
        />
      </section>

      <section className="mb-10">
        <NotasClienteForm
          clienteId={cliente.id}
          notasIniciales={cliente.notasAdmin ?? ""}
        />
      </section>

      <section className="mb-10">
        <h2 className="display-tight mb-4 text-xl sm:text-2xl">
          {COPY.admin.clientes.historial.title}
        </h2>

        {cliente.turnos.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {COPY.admin.clientes.historial.vacio}
          </div>
        ) : (
          <>
            {/* Mobile: cards apiladas. */}
            <ul className="space-y-2 sm:hidden">
              {cliente.turnos.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border border-border bg-card p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-medium">
                      {fechaCortaAR(t.inicioTs)}{" "}
                      <span className="numeral text-muted-foreground">
                        · {horaCortaAR(t.inicioTs)}
                      </span>
                    </div>
                    <TurnoEstadoBadge estado={t.estado} />
                  </div>
                  <div className="mt-2 grid gap-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Barbero: </span>
                      <span className="font-medium">{t.barberoNombre}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Servicio: </span>
                      <span className="font-medium">{t.servicioNombre}</span>
                      <span className="ml-1 text-muted-foreground">
                        ({formatDuracion(t.duracionMin)})
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Precio: </span>
                      <span className="numeral font-medium">
                        {formatPrecioARS(t.precioTotal)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: tabla. */}
            <div className="hidden overflow-hidden rounded-md border border-border sm:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">
                      {COPY.admin.clientes.historial.columnaFecha}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {COPY.admin.clientes.historial.columnaBarbero}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {COPY.admin.clientes.historial.columnaServicio}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {COPY.admin.clientes.historial.columnaPrecio}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {COPY.admin.clientes.historial.columnaEstado}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.turnos.map((t) => (
                    <tr
                      key={t.id}
                      className="border-t border-border last:border-b-0"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">
                          {fechaCortaAR(t.inicioTs)}
                        </div>
                        <div className="numeral text-xs text-muted-foreground">
                          {horaCortaAR(t.inicioTs)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">{t.barberoNombre}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{t.servicioNombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDuracion(t.duracionMin)}
                        </div>
                      </td>
                      <td className="numeral px-4 py-3 text-right align-top font-medium">
                        {formatPrecioARS(t.precioTotal)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <TurnoEstadoBadge estado={t.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  numeral = false,
}: {
  label: string;
  value: string;
  hint?: string;
  numeral?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div
        className={
          numeral
            ? "numeral mt-2 text-lg font-medium"
            : "mt-2 text-lg font-medium"
        }
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
