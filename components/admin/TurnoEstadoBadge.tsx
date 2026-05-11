import { COPY } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Badge visual para los 5 estados posibles de un turno.
 * Pensado para usarse tanto en la agenda como en el historial del cliente.
 *
 * Diseño:
 *  - `confirmado`: foreground neutro (turno activo a futuro).
 *  - `completado`: muted (ya pasó OK).
 *  - `cancelado_cliente` / `cancelado_admin`: destructive muted.
 *  - `no_show`: warning (amber) — el cliente no apareció, requiere atención.
 *
 * Mantiene la estética monocromática + un solo color de "alerta suave" para
 * no-show, sin meter dependencias nuevas en el theme.
 */

const ESTADOS = COPY.admin.clientes.estadoBadge;

type EstadoTurno =
  | "confirmado"
  | "completado"
  | "cancelado_cliente"
  | "cancelado_admin"
  | "no_show";

const STYLES: Record<EstadoTurno, string> = {
  confirmado: "border-foreground/40 text-foreground",
  completado: "border-border text-muted-foreground",
  cancelado_cliente:
    "border-destructive/40 text-destructive bg-destructive/5",
  cancelado_admin:
    "border-destructive/40 text-destructive bg-destructive/5",
  no_show:
    "border-amber-500/50 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30",
};

const LABELS: Record<EstadoTurno, string> = {
  confirmado: ESTADOS.confirmado,
  completado: ESTADOS.completado,
  cancelado_cliente: ESTADOS.cancelado_cliente,
  cancelado_admin: ESTADOS.cancelado_admin,
  no_show: ESTADOS.no_show,
};

export function TurnoEstadoBadge({
  estado,
  className,
}: {
  estado: string;
  className?: string;
}) {
  const e = (estado as EstadoTurno) ?? "confirmado";
  const style = STYLES[e] ?? STYLES.confirmado;
  const label = LABELS[e] ?? estado;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]",
        style,
        className
      )}
    >
      {label}
    </span>
  );
}
