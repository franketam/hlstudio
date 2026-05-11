import { formatDuracion, formatPrecioARS } from "@/lib/format";

type Props = {
  barberoNombre?: string;
  servicioNombre?: string;
  duracionMin?: number;
  precio?: string;
  fechaLabel?: string;
  horaLabel?: string;
};

/**
 * Tarjeta compacta de resumen del estado parcial de la reserva.
 * Se muestra al costado o arriba del formulario en cada paso.
 */
export function ResumenReserva({
  barberoNombre,
  servicioNombre,
  duracionMin,
  precio,
  fechaLabel,
  horaLabel,
}: Props) {
  const items: Array<{ label: string; value: string }> = [];

  if (barberoNombre) {
    items.push({ label: "Barbero", value: barberoNombre });
  }
  if (servicioNombre) {
    items.push({
      label: "Servicio",
      value:
        servicioNombre +
        (duracionMin ? ` · ${formatDuracion(duracionMin)}` : ""),
    });
  }
  if (precio) {
    items.push({ label: "Precio", value: formatPrecioARS(precio) });
  }
  if (fechaLabel) {
    items.push({
      label: "Cuándo",
      value: horaLabel ? `${fechaLabel} · ${horaLabel}` : fechaLabel,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card/60 p-4">
      <p className="mb-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        Tu reserva
      </p>
      <dl className="space-y-1 text-sm">
        {items.map((it) => (
          <div key={it.label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd className="text-right font-medium text-foreground">
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
