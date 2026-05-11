import Link from "next/link";
import { searchClientes } from "@/server/queries/admin-clientes";
import { COPY } from "@/lib/constants";
import { fechaCortaAR, formatPrecioARS } from "@/lib/format";
import { ClientesSearchBox } from "./ClientesSearchBox";

export const metadata = {
  title: "Clientes",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string }>;

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const clientesRows = await searchClientes(q, 20);

  return (
    <div className="container py-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {COPY.admin.clientes.eyebrow}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {COPY.admin.clientes.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.admin.clientes.subtitle}
        </p>
      </div>

      <div className="mb-5">
        <ClientesSearchBox defaultValue={q} />
      </div>

      <div className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {q.length > 0
          ? COPY.admin.clientes.resultadosBusqueda(clientesRows.length)
          : COPY.admin.clientes.topReciente}
      </div>

      {clientesRows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {q.length > 0
            ? COPY.admin.clientes.vacioBusqueda
            : COPY.admin.clientes.vacioInicial}
        </div>
      ) : (
        <ul className="space-y-2">
          {clientesRows.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border bg-card transition-colors hover:bg-accent/30"
            >
              <Link
                href={`/admin/clientes/${c.id}`}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                aria-label={`${COPY.admin.clientes.verFicha} ${c.nombre}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-base font-medium">
                    {c.nombre}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="numeral">{c.telefono}</span>
                    {c.email ? (
                      <span className="truncate">{c.email}</span>
                    ) : (
                      <span className="italic">
                        {COPY.admin.clientes.sinEmail}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs sm:flex sm:gap-6 sm:text-right">
                  <Metric
                    label={COPY.admin.clientes.totalTurnos}
                    value={String(c.totalTurnos)}
                  />
                  <Metric
                    label={COPY.admin.clientes.ultimaVisita}
                    value={
                      c.ultimaVisita
                        ? fechaCortaAR(c.ultimaVisita)
                        : COPY.admin.clientes.sinUltimaVisita
                    }
                  />
                  <Metric
                    label={COPY.admin.clientes.gastoTotal}
                    value={formatPrecioARS(c.gastoTotal)}
                    numeral
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  numeral = false,
}: {
  label: string;
  value: string;
  numeral?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span
        className={
          numeral
            ? "numeral text-sm font-medium text-foreground"
            : "text-sm font-medium text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
