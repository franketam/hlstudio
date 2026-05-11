"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDuracion } from "@/lib/format";
import { savePreciosAction } from "./actions";

type Barbero = { id: string; nombre: string; orden: number };
type Servicio = {
  id: string;
  nombre: string;
  duracionMin: number;
  orden: number;
};

type Props = {
  barberos: Barbero[];
  servicios: Servicio[];
  /** Map "barberoId__servicioId" → string numérico (ej "16000.00"). */
  precios: Record<string, string>;
};

/**
 * Matriz editable de precios barbero × servicio.
 *
 * Estado:
 * - `original`: snapshot inmutable de lo que vino del server (post-revalidate).
 * - `draft`: lo que el admin está editando ahora (strings — el input es libre).
 * - Dirty = cualquier celda donde draft difiere del original NORMALIZADO.
 *
 * Al guardar, sólo enviamos los cambios. Celdas vaciadas (string vacío) que
 * antes tenían valor → DELETE en el server. Celdas con número → upsert.
 *
 * Validación local: bloqueo el guardar si alguna celda dirty tiene texto que
 * no parsea a número válido.
 */

const cellKey = (barberoId: string, servicioId: string) =>
  `${barberoId}__${servicioId}`;

/**
 * Normaliza un precio string de DB ("16000.00") al display que pongo en el input
 * ("16000"). Mantengo decimales sólo si son != .00.
 */
function dbToInput(raw: string | undefined): string {
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  // Si es entero, sin decimales. Si tiene decimales, hasta 2.
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Parsea lo que el admin escribió en un input a number | null | "invalid".
 * - "" → null (intención: borrar la celda).
 * - número válido entre 0 y 9_999_999.99 → number.
 * - otra cosa → "invalid".
 */
function parseInputCell(raw: string): number | null | "invalid" {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "invalid";
  if (n < 0 || n > 9_999_999.99) return "invalid";
  return n;
}

/**
 * Compara la versión normalizada del original con el draft actual para
 * decidir si la celda está "sucia".
 */
function isDirty(originalRaw: string | undefined, draft: string): boolean {
  const normalizedOriginal = dbToInput(originalRaw);
  return normalizedOriginal !== draft.trim();
}

export function MatrizPreciosEditor({ barberos, servicios, precios }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { type: "ok"; message: string }
    | { type: "error"; message: string }
    | null
  >(null);

  // Inicializo el draft con los valores actuales de BD ya normalizados a string.
  const initialDraft = useMemo(() => {
    const out: Record<string, string> = {};
    for (const b of barberos) {
      for (const s of servicios) {
        const k = cellKey(b.id, s.id);
        out[k] = dbToInput(precios[k]);
      }
    }
    return out;
  }, [barberos, servicios, precios]);

  const [draft, setDraft] = useState<Record<string, string>>(initialDraft);

  const updateCell = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (feedback?.type === "ok") setFeedback(null);
  };

  // Compute dirty + invalid en cada render. La matriz es chica (<= 20×20 en la
  // práctica) → costo despreciable.
  const { dirtyKeys, invalidKeys } = useMemo(() => {
    const dirty: string[] = [];
    const invalid: string[] = [];
    for (const b of barberos) {
      for (const s of servicios) {
        const k = cellKey(b.id, s.id);
        const draftVal = draft[k] ?? "";
        if (!isDirty(precios[k], draftVal)) continue;
        dirty.push(k);
        const parsed = parseInputCell(draftVal);
        if (parsed === "invalid") invalid.push(k);
      }
    }
    return { dirtyKeys: dirty, invalidKeys: invalid };
  }, [draft, barberos, servicios, precios]);

  const dirtyCount = dirtyKeys.length;
  const hasInvalid = invalidKeys.length > 0;
  const canSave = dirtyCount > 0 && !hasInvalid && !pending;

  const onDescartar = () => {
    setDraft(initialDraft);
    setFeedback(null);
  };

  const onGuardar = () => {
    if (!canSave) return;
    setFeedback(null);

    const items = dirtyKeys.map((k) => {
      const [barberoId, servicioId] = k.split("__") as [string, string];
      const parsed = parseInputCell(draft[k] ?? "");
      // Si llegó hasta acá, parsed nunca es "invalid" (canSave lo bloquea).
      const precio = parsed === "invalid" ? null : parsed;
      return { barberoId, servicioId, precio };
    });

    startTransition(async () => {
      const res = await savePreciosAction({ items });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error.message });
        return;
      }
      setFeedback({
        type: "ok",
        message: COPY.admin.precios.guardadoOk,
      });
      // Recargo los server props para que `precios` refleje el nuevo estado.
      // Después de refresh el useMemo recalcula initialDraft y los dirty
      // markers vuelven a cero.
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-[160px] border-b border-r border-border bg-muted/40 px-4 py-3 font-medium"
              >
                {COPY.admin.precios.headerBarbero}
              </th>
              {servicios.map((s) => (
                <th
                  key={s.id}
                  scope="col"
                  className="min-w-[160px] border-b border-border px-4 py-3 font-medium"
                >
                  <div className="text-foreground">{s.nombre}</div>
                  <div className="mt-0.5 text-[10px] font-normal tracking-normal text-muted-foreground">
                    {formatDuracion(s.duracionMin)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {barberos.map((b) => (
              <tr key={b.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[160px] border-r border-border bg-background px-4 py-3 text-left font-medium"
                >
                  {b.nombre}
                </th>
                {servicios.map((s) => {
                  const k = cellKey(b.id, s.id);
                  const value = draft[k] ?? "";
                  const dirty = dirtyKeys.includes(k);
                  const invalid = invalidKeys.includes(k);
                  const isEmpty = value.trim() === "";
                  return (
                    <td
                      key={s.id}
                      className={cn(
                        "min-w-[160px] px-3 py-2 align-top",
                        dirty && "bg-accent/20"
                      )}
                    >
                      <PrecioCellInput
                        id={`precio-${k}`}
                        value={value}
                        dirty={dirty}
                        invalid={invalid}
                        empty={isEmpty}
                        ariaLabel={`Precio de ${s.nombre} para ${b.nombre}`}
                        onChange={(v) => updateCell(k, v)}
                      />
                      {isEmpty ? (
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                          {COPY.admin.precios.hintCeldaVacia}
                        </p>
                      ) : null}
                      {invalid ? (
                        <p
                          role="alert"
                          className="mt-1 text-[10px] leading-snug text-destructive"
                        >
                          {COPY.admin.precios.precioInvalido}
                        </p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-live="polite"
          className={cn(
            "text-xs",
            dirtyCount > 0
              ? "font-medium text-foreground"
              : "text-muted-foreground"
          )}
        >
          {dirtyCount > 0
            ? COPY.admin.precios.cambiosPendientes(dirtyCount)
            : COPY.admin.precios.sinCambios}
        </span>
        {hasInvalid ? (
          <span role="alert" className="text-xs text-destructive">
            {COPY.admin.precios.precioInvalido}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirtyCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDescartar}
              disabled={pending}
            >
              {COPY.admin.precios.descartar}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={onGuardar}
            disabled={!canSave}
            aria-busy={pending}
          >
            {pending
              ? COPY.admin.precios.guardando
              : COPY.admin.precios.guardar}
          </Button>
        </div>
      </div>

      {feedback ? (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "text-sm",
            feedback.type === "error"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

type CellInputProps = {
  id: string;
  value: string;
  dirty: boolean;
  invalid: boolean;
  empty: boolean;
  ariaLabel: string;
  onChange: (v: string) => void;
};

function PrecioCellInput({
  id,
  value,
  dirty,
  invalid,
  empty,
  ariaLabel,
  onChange,
}: CellInputProps) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={invalid ? "true" : "false"}
        placeholder={empty ? COPY.admin.precios.placeholderVacio : ""}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "flex h-10 w-full rounded-md border bg-background pl-7 pr-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm",
          invalid
            ? "border-destructive focus-visible:ring-destructive"
            : dirty
              ? "border-foreground"
              : "border-input"
        )}
      />
      {dirty && !invalid ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-foreground"
          title="Cambio sin guardar"
        >
          *
        </span>
      ) : null}
    </div>
  );
}
