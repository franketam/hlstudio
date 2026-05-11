"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COPY,
  DIAS_SEMANA_ES,
  DIAS_SEMANA_ORDEN_LUN_DOM,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { saveHorariosAction } from "./actions";
import type { HorariosConfigData, RangoHorario } from "@/server/queries/admin-config";

type DiaDraft = {
  abierto: boolean;
  rangos: RangoHorario[];
};

type Props = {
  initial: HorariosConfigData;
};

/**
 * Editor único de horarios de operación + descansos recurrentes.
 *
 * Modelo:
 *  - Una fila por día (Lun→Dom, orden visual local).
 *  - Toggle "abierto/cerrado" por día.
 *  - Si abierto: lista de rangos editables con apertura/cierre + botón "agregar".
 *  - Dirty flag por día (no por rango). Cualquier diferencia con `initial.dias[d]`
 *    marca el día como sucio.
 *  - Validación local: overlap, apertura<cierre, días abiertos con >= 1 rango.
 *  - Guardar = bulk-replace transaccional de los días dirty (DELETE + INSERT).
 */

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":");
  return Number(hh ?? "0") * 60 + Number(mm ?? "0");
}

/**
 * Estructura igual al payload server, sin segundos en los rangos.
 */
function cloneDia(d: DiaDraft): DiaDraft {
  return {
    abierto: d.abierto,
    rangos: d.rangos.map((r) => ({ ...r })),
  };
}

function isDiaDirty(original: DiaDraft, draft: DiaDraft): boolean {
  if (original.abierto !== draft.abierto) return true;
  if (original.rangos.length !== draft.rangos.length) return true;
  // Comparo posicionalmente — el orden de los rangos es relevante para el usuario
  // aunque al server le da igual. Si cambia el orden, lo considero edición.
  for (let i = 0; i < original.rangos.length; i++) {
    const a = original.rangos[i]!;
    const b = draft.rangos[i]!;
    if (a.apertura !== b.apertura || a.cierre !== b.cierre) return true;
  }
  return false;
}

type DiaErrors = {
  rangoFormato?: number[]; // índices con HH:MM inválido o apertura>=cierre
  overlap?: boolean;
  faltaRango?: boolean;
};

function validateDia(d: DiaDraft): DiaErrors {
  const errs: DiaErrors = {};
  if (!d.abierto) return errs;
  if (d.rangos.length === 0) {
    errs.faltaRango = true;
    return errs;
  }
  const malos: number[] = [];
  for (let i = 0; i < d.rangos.length; i++) {
    const r = d.rangos[i]!;
    if (!HHMM_RE.test(r.apertura) || !HHMM_RE.test(r.cierre)) {
      malos.push(i);
      continue;
    }
    if (toMinutes(r.apertura) >= toMinutes(r.cierre)) {
      malos.push(i);
    }
  }
  if (malos.length > 0) errs.rangoFormato = malos;

  // Overlap: solo si todos parsean ok.
  if (malos.length === 0 && d.rangos.length > 1) {
    const sorted = d.rangos
      .map((r, idx) => ({ r, idx }))
      .sort((a, b) => toMinutes(a.r.apertura) - toMinutes(b.r.apertura));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (toMinutes(curr.r.apertura) < toMinutes(prev.r.cierre)) {
        errs.overlap = true;
        break;
      }
    }
  }
  return errs;
}

export function HorariosEditor({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { type: "ok"; message: string }
    | { type: "error"; message: string }
    | null
  >(null);

  // Snapshot inmutable del estado original (post-revalidate). Sirve para dirty-check
  // y descartar cambios.
  const original = useMemo<Record<number, DiaDraft>>(() => {
    const out: Record<number, DiaDraft> = {};
    for (let d = 0; d <= 6; d++) {
      const src = initial.dias[d] ?? { abierto: false, rangos: [] };
      out[d] = cloneDia(src);
    }
    return out;
  }, [initial]);

  const initialDraft = useMemo<Record<number, DiaDraft>>(() => {
    const out: Record<number, DiaDraft> = {};
    for (let d = 0; d <= 6; d++) out[d] = cloneDia(original[d]!);
    return out;
  }, [original]);

  const [draft, setDraft] = useState<Record<number, DiaDraft>>(initialDraft);

  const updateDia = (dia: number, mutate: (d: DiaDraft) => DiaDraft) => {
    setDraft((prev) => ({ ...prev, [dia]: mutate(prev[dia]!) }));
    if (feedback?.type === "ok") setFeedback(null);
  };

  const toggleAbierto = (dia: number, abierto: boolean) => {
    updateDia(dia, (d) => {
      if (abierto) {
        // Si lo abren y no tenía rangos, sembramos uno razonable (10:00-13:00).
        const rangos =
          d.rangos.length > 0
            ? d.rangos
            : [{ apertura: "10:00", cierre: "13:00" } as RangoHorario];
        return { abierto: true, rangos };
      }
      // Cerrado: vaciamos rangos (la persistencia los borra igual, pero así el UI queda coherente).
      return { abierto: false, rangos: [] };
    });
  };

  const addRango = (dia: number) => {
    updateDia(dia, (d) => ({
      ...d,
      rangos: [...d.rangos, { apertura: "15:00", cierre: "20:00" }],
    }));
  };

  const removeRango = (dia: number, idx: number) => {
    updateDia(dia, (d) => ({
      ...d,
      rangos: d.rangos.filter((_, i) => i !== idx),
    }));
  };

  const updateRango = (
    dia: number,
    idx: number,
    field: "apertura" | "cierre",
    value: string
  ) => {
    updateDia(dia, (d) => ({
      ...d,
      rangos: d.rangos.map((r, i) =>
        i === idx ? { ...r, [field]: value } : r
      ),
    }));
  };

  // Compute dirty + errores por día.
  const { dirtyDays, anyInvalid, errorsByDia } = useMemo(() => {
    const dirty: number[] = [];
    const errors: Record<number, DiaErrors> = {};
    let invalid = false;
    for (let d = 0; d <= 6; d++) {
      const orig = original[d]!;
      const curr = draft[d]!;
      const dirtyHere = isDiaDirty(orig, curr);
      if (dirtyHere) dirty.push(d);
      const errs = validateDia(curr);
      errors[d] = errs;
      const hasErr =
        !!errs.overlap ||
        !!errs.faltaRango ||
        (errs.rangoFormato?.length ?? 0) > 0;
      if (hasErr) invalid = true;
    }
    return { dirtyDays: dirty, anyInvalid: invalid, errorsByDia: errors };
  }, [draft, original]);

  const dirtyCount = dirtyDays.length;
  const canSave = dirtyCount > 0 && !anyInvalid && !pending;

  const onDescartar = () => {
    setDraft(initialDraft);
    setFeedback(null);
  };

  const onGuardar = () => {
    if (!canSave) return;
    setFeedback(null);

    const payload = dirtyDays.map((dia) => {
      const d = draft[dia]!;
      return {
        diaSemana: dia,
        abierto: d.abierto,
        rangos: d.rangos.map((r) => ({
          apertura: r.apertura,
          cierre: r.cierre,
        })),
      };
    });

    startTransition(async () => {
      const res = await saveHorariosAction({ dias: payload });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error.message });
        return;
      }
      setFeedback({
        type: "ok",
        message: COPY.admin.horarios.guardadoOk,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {DIAS_SEMANA_ORDEN_LUN_DOM.map((diaIdx) => {
          const d = draft[diaIdx]!;
          const dirty = dirtyDays.includes(diaIdx);
          const errs = errorsByDia[diaIdx] ?? {};
          return (
            <li
              key={diaIdx}
              className={cn(
                "rounded-md border bg-card p-4 transition-colors",
                dirty ? "border-foreground" : "border-border",
                !d.abierto && "opacity-90"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-[7rem] text-base font-medium">
                    {DIAS_SEMANA_ES[diaIdx]}
                  </span>
                  <DiaToggle
                    abierto={d.abierto}
                    onChange={(v) => toggleAbierto(diaIdx, v)}
                    ariaLabel={`${DIAS_SEMANA_ES[diaIdx]} ${d.abierto ? COPY.admin.horarios.diaAbierto : COPY.admin.horarios.diaCerrado}`}
                  />
                </div>
                {dirty ? (
                  <span
                    aria-hidden="true"
                    className="text-xs font-medium text-foreground"
                  >
                    *
                  </span>
                ) : null}
              </div>

              {d.abierto ? (
                <div className="mt-4 space-y-3">
                  {d.rangos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {COPY.admin.horarios.sinRangos}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {d.rangos.map((r, idx) => {
                        const invalid = errs.rangoFormato?.includes(idx) ?? false;
                        return (
                          <li
                            key={idx}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <div className="flex flex-col">
                              <label
                                htmlFor={`apertura-${diaIdx}-${idx}`}
                                className="text-[10px] uppercase tracking-wider text-muted-foreground"
                              >
                                {COPY.admin.horarios.apertura}
                              </label>
                              <input
                                id={`apertura-${diaIdx}-${idx}`}
                                type="time"
                                value={r.apertura}
                                onChange={(e) =>
                                  updateRango(
                                    diaIdx,
                                    idx,
                                    "apertura",
                                    e.target.value
                                  )
                                }
                                aria-invalid={invalid ? "true" : "false"}
                                className={cn(
                                  "h-11 rounded-md border bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm",
                                  invalid
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : "border-input"
                                )}
                              />
                            </div>
                            <span
                              aria-hidden="true"
                              className="pb-3 text-muted-foreground"
                            >
                              –
                            </span>
                            <div className="flex flex-col">
                              <label
                                htmlFor={`cierre-${diaIdx}-${idx}`}
                                className="text-[10px] uppercase tracking-wider text-muted-foreground"
                              >
                                {COPY.admin.horarios.cierre}
                              </label>
                              <input
                                id={`cierre-${diaIdx}-${idx}`}
                                type="time"
                                value={r.cierre}
                                onChange={(e) =>
                                  updateRango(
                                    diaIdx,
                                    idx,
                                    "cierre",
                                    e.target.value
                                  )
                                }
                                aria-invalid={invalid ? "true" : "false"}
                                className={cn(
                                  "h-11 rounded-md border bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm",
                                  invalid
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : "border-input"
                                )}
                              />
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => removeRango(diaIdx, idx)}
                              aria-label={`${COPY.admin.horarios.eliminarRango} ${idx + 1}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addRango(diaIdx)}
                    >
                      + {COPY.admin.horarios.agregarRango}
                    </Button>
                    {errs.faltaRango ? (
                      <span role="alert" className="text-xs text-destructive">
                        {COPY.admin.horarios.errorRangoFaltante}
                      </span>
                    ) : null}
                    {errs.overlap ? (
                      <span role="alert" className="text-xs text-destructive">
                        {COPY.admin.horarios.errorRangoSolapado}
                      </span>
                    ) : null}
                    {errs.rangoFormato && errs.rangoFormato.length > 0 ? (
                      <span role="alert" className="text-xs text-destructive">
                        {COPY.admin.horarios.errorRangoInvalido}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

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
            ? COPY.admin.horarios.cambiosPendientes(dirtyCount)
            : COPY.admin.horarios.sinCambios}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirtyCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDescartar}
              disabled={pending}
            >
              {COPY.admin.horarios.descartar}
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
              ? COPY.admin.horarios.guardando
              : COPY.admin.horarios.guardar}
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

type DiaToggleProps = {
  abierto: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
};

/**
 * Toggle accesible. No usamos un checkbox nativo porque queremos look + label
 * que comunique estado ("Abierto"/"Cerrado") con buen contraste en mobile.
 */
function DiaToggle({ abierto, onChange, ariaLabel }: DiaToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={abierto}
      aria-label={ariaLabel}
      onClick={() => onChange(!abierto)}
      className={cn(
        "inline-flex h-9 min-w-[7rem] items-center justify-center rounded-md border px-3 text-xs font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        abierto
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground"
      )}
    >
      {abierto ? COPY.admin.horarios.diaAbierto : COPY.admin.horarios.diaCerrado}
    </button>
  );
}
