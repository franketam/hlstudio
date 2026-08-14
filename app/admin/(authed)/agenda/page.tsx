import Link from "next/link";
import { addDays, parseISO } from "date-fns";
import { listTurnosDelDia } from "@/server/queries/admin";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import {
  fechaLargaAR,
  formatDuracion,
  formatPrecioARS,
  horaCortaAR,
  ymdLocal,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { describirUserAgent } from "@/lib/user-agent";
import { CancelarTurnoAdminButton } from "./CancelarTurnoAdminButton";
import { BloquearTurnoButton } from "./BloquearTurnoButton";

export const metadata = {
  title: "Agenda",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ fecha?: string }>;

export default async function AdminAgendaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const hoyYmd = ymdLocal(new Date());
  const fecha = sp.fecha ?? hoyYmd;

  let validDate = true;
  let parsed: Date | null = null;
  try {
    parsed = parseISO(`${fecha}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) validDate = false;
  } catch {
    validDate = false;
  }
  if (!validDate || !parsed) {
    return (
      <div className="container py-8">
        <p className="text-sm text-destructive">Fecha inválida.</p>
      </div>
    );
  }

  const turnosDia = await listTurnosDelDia(fecha);

  const prevYmd = ymdLocal(addDays(parsed, -1));
  const nextYmd = ymdLocal(addDays(parsed, 1));

  const fechaLabel = fechaLargaAR(parsed);
  const esHoy = fecha === hoyYmd;

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Panel
          </p>
          <h1 className="display-tight mt-1 text-3xl sm:text-4xl">Agenda</h1>
        </div>
        <Button asChild>
          <Link href="/admin/agenda/nuevo">{COPY.admin.nuevoTurno.cta}</Link>
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={{ pathname: "/admin/agenda", query: { fecha: prevYmd } }}>
            ← Día anterior
          </Link>
        </Button>
        <Button
          asChild
          variant={esHoy ? "default" : "outline"}
          size="sm"
        >
          <Link href={{ pathname: "/admin/agenda" }}>Hoy</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={{ pathname: "/admin/agenda", query: { fecha: nextYmd } }}>
            Día siguiente →
          </Link>
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {fechaLabel}
        </span>
      </div>

      {turnosDia.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Sin turnos para este día.
        </div>
      ) : (
        <ul className="space-y-2">
          {turnosDia.map((t) => {
            const cancelado =
              t.estado === "cancelado_cliente" ||
              t.estado === "cancelado_admin";
            const resumen = `${horaCortaAR(t.inicioTs)} — ${t.clienteNombre} · ${t.servicioNombre}`;
            return (
              <li
                key={t.id}
                className={cn(
                  "rounded-md border bg-card p-4",
                  cancelado
                    ? "border-border/50 opacity-60"
                    : "border-border"
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <div className="numeral text-xl font-medium">
                    {horaCortaAR(t.inicioTs)}
                  </div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {formatDuracion(t.duracionMin)}
                  </div>
                  <span
                    className={cn(
                      "ml-auto rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]",
                      cancelado
                        ? "border-destructive/40 text-destructive"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {cancelado ? "Cancelado" : t.estado}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Cliente: </span>
                    <span className="font-medium">{t.clienteNombre}</span>
                    <span className="ml-2 text-muted-foreground">
                      {t.clienteTelefono}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Barbero: </span>
                    <span className="font-medium">{t.barberoNombre}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Servicio: </span>
                    <span className="font-medium">{t.servicioNombre}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Precio: </span>
                    <span className="numeral font-medium">
                      {formatPrecioARS(t.precioTotal)}
                    </span>
                  </div>
                  {t.creadoIp ? (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Origen: </span>
                      <span className="numeral">{t.creadoIp}</span>
                      <span className="ml-2 text-muted-foreground">
                        {describirUserAgent(t.creadoUserAgent)}
                      </span>
                    </div>
                  ) : t.origen === "admin" ? (
                    <div className="sm:col-span-2 text-muted-foreground">
                      Cargado desde el panel
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap items-start justify-end gap-2 border-t border-border/60 pt-3">
                  <BloquearTurnoButton
                    turnoId={t.id}
                    resumen={resumen}
                    ip={t.creadoIp}
                    email={t.clienteEmail}
                    telefono={t.clienteTelefono}
                    cancelable={!cancelado}
                  />
                  {!cancelado ? (
                    <CancelarTurnoAdminButton
                      turnoId={t.id}
                      resumen={resumen}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
