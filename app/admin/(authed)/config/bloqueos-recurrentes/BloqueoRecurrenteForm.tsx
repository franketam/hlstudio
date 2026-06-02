"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPY } from "@/lib/constants";
import { createBloqueoRecurrenteAction } from "./actions";

type BarberoOption = {
  id: string;
  nombre: string;
};

type Props = {
  barberos: BarberoOption[];
  onCancel: () => void;
};

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validación cliente. El server vuelve a chequear todo (no confiar).
 */
const clientSchema = z
  .object({
    barberoId: z.string().min(1, COPY.admin.bloqueosRecurrentes.errorBarberoFaltante),
    diaSemana: z.string().min(1, COPY.admin.bloqueosRecurrentes.errorDiaFaltante),
    diaCompleto: z.boolean(),
    desdeHora: z.string().optional(),
    hastaHora: z.string().optional(),
    motivo: z.string().max(255, "Motivo demasiado largo.").optional(),
  })
  .superRefine((d, ctx) => {
    if (d.diaCompleto) return;
    if (!d.desdeHora || !HHMM_RE.test(d.desdeHora)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["desdeHora"],
        message: COPY.admin.bloqueosRecurrentes.errorHoraFaltante,
      });
    }
    if (!d.hastaHora || !HHMM_RE.test(d.hastaHora)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hastaHora"],
        message: COPY.admin.bloqueosRecurrentes.errorHoraFaltante,
      });
    }
    if (
      d.desdeHora &&
      d.hastaHora &&
      HHMM_RE.test(d.desdeHora) &&
      HHMM_RE.test(d.hastaHora) &&
      d.desdeHora >= d.hastaHora
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hastaHora"],
        message: COPY.admin.bloqueosRecurrentes.errorHorasInvertidas,
      });
    }
  });

type FormData = z.infer<typeof clientSchema>;

export function BloqueoRecurrenteForm({ barberos, onCancel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      barberoId: barberos[0]?.id ?? "",
      diaSemana: "",
      diaCompleto: false,
      desdeHora: "",
      hastaHora: "",
      motivo: "",
    },
  });

  const diaCompleto = watch("diaCompleto");

  const onSubmit = (data: FormData) => {
    setServerError(null);
    // Día completo: lo expresamos como 00:00 → 23:59 (franja semi-abierta que
    // cubre todo el día operativo de la barbería).
    const desdeHora = data.diaCompleto ? "00:00" : data.desdeHora ?? "";
    const hastaHora = data.diaCompleto ? "23:59" : data.hastaHora ?? "";

    startTransition(async () => {
      const res = await createBloqueoRecurrenteAction({
        barberoId: data.barberoId,
        diaSemana: Number(data.diaSemana),
        desdeHora,
        hastaHora,
        motivo: data.motivo ?? "",
      });

      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      router.refresh();
      onCancel();
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-5 rounded-md border border-border bg-card p-5"
      aria-busy={pending}
    >
      {/* Barbero */}
      <div className="space-y-2">
        <Label htmlFor="barberoId">
          {COPY.admin.bloqueosRecurrentes.barberoLabel}
        </Label>
        <select
          id="barberoId"
          aria-invalid={errors.barberoId ? "true" : "false"}
          aria-describedby={errors.barberoId ? "barberoId-error" : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm"
          {...register("barberoId")}
        >
          <option value="">
            {COPY.admin.bloqueosRecurrentes.barberoPlaceholder}
          </option>
          {barberos.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </select>
        {errors.barberoId ? (
          <p
            id="barberoId-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.barberoId.message}
          </p>
        ) : null}
      </div>

      {/* Día de la semana */}
      <div className="space-y-2">
        <Label htmlFor="diaSemana">
          {COPY.admin.bloqueosRecurrentes.diaLabel}
        </Label>
        <select
          id="diaSemana"
          aria-invalid={errors.diaSemana ? "true" : "false"}
          aria-describedby={errors.diaSemana ? "diaSemana-error" : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm"
          {...register("diaSemana")}
        >
          <option value="">—</option>
          {COPY.admin.bloqueosRecurrentes.diasSemana.map((nombre, idx) => (
            <option key={idx} value={String(idx)}>
              {nombre}
            </option>
          ))}
        </select>
        {errors.diaSemana ? (
          <p
            id="diaSemana-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.diaSemana.message}
          </p>
        ) : null}
      </div>

      {/* Día completo */}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          {...register("diaCompleto")}
        />
        {COPY.admin.bloqueosRecurrentes.diaCompleto}
      </label>

      {/* Franja horaria */}
      {!diaCompleto ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="desdeHora">
              {COPY.admin.bloqueosRecurrentes.desde}
            </Label>
            <Input
              id="desdeHora"
              type="time"
              aria-invalid={errors.desdeHora ? "true" : "false"}
              aria-describedby={
                errors.desdeHora ? "desdeHora-error" : undefined
              }
              {...register("desdeHora")}
            />
            {errors.desdeHora ? (
              <p
                id="desdeHora-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.desdeHora.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="hastaHora">
              {COPY.admin.bloqueosRecurrentes.hasta}
            </Label>
            <Input
              id="hastaHora"
              type="time"
              aria-invalid={errors.hastaHora ? "true" : "false"}
              aria-describedby={
                errors.hastaHora ? "hastaHora-error" : undefined
              }
              {...register("hastaHora")}
            />
            {errors.hastaHora ? (
              <p
                id="hastaHora-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.hastaHora.message}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Motivo */}
      <div className="space-y-2">
        <Label htmlFor="motivo">{COPY.admin.bloqueosRecurrentes.motivo}</Label>
        <textarea
          id="motivo"
          rows={2}
          placeholder={COPY.admin.bloqueosRecurrentes.motivoPlaceholder}
          aria-invalid={errors.motivo ? "true" : "false"}
          aria-describedby={errors.motivo ? "motivo-error" : undefined}
          className="flex w-full rounded-md border border-input bg-background px-3.5 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          {...register("motivo")}
        />
        {errors.motivo ? (
          <p id="motivo-error" role="alert" className="text-sm text-destructive">
            {errors.motivo.message}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending
            ? COPY.admin.bloqueosRecurrentes.creando
            : COPY.admin.bloqueosRecurrentes.crear}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          {COPY.admin.bloqueosRecurrentes.cancelarNuevo}
        </Button>
      </div>
    </form>
  );
}
