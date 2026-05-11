"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { createBloqueoAction } from "./actions";

type BarberoOption = {
  id: string;
  nombre: string;
};

type Props = {
  barberos: BarberoOption[];
  onCancel: () => void;
};

/**
 * Validación cliente. El server vuelve a chequear todo (no confiar).
 * Acepta cualquier "YYYY-MM-DD" — los browsers normalizan el input type="date".
 */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const clientSchema = z
  .object({
    alcance: z.enum(["barbero", "local"]),
    barberoId: z.string().optional(),
    tipo: z.enum(["un_dia", "varios_dias"]),
    fecha: z.string().optional(),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    motivo: z.string().max(255, "Motivo demasiado largo.").optional(),
  })
  .superRefine((d, ctx) => {
    if (d.alcance === "barbero" && !d.barberoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barberoId"],
        message: COPY.admin.bloqueos.errorBarberoFaltante,
      });
    }
    if (d.tipo === "un_dia") {
      if (!d.fecha || !YMD_RE.test(d.fecha)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fecha"],
          message: "Elegí una fecha.",
        });
      }
    } else {
      if (!d.desde || !YMD_RE.test(d.desde)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["desde"],
          message: "Elegí la fecha de inicio.",
        });
      }
      if (!d.hasta || !YMD_RE.test(d.hasta)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hasta"],
          message: "Elegí la fecha de fin.",
        });
      }
      if (
        d.desde &&
        d.hasta &&
        YMD_RE.test(d.desde) &&
        YMD_RE.test(d.hasta) &&
        d.hasta < d.desde
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hasta"],
          message: COPY.admin.bloqueos.errorFechasInvertidas,
        });
      }
    }
  });

type FormData = z.infer<typeof clientSchema>;

export function BloqueoForm({ barberos, onCancel }: Props) {
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
      alcance: barberos.length > 0 ? "barbero" : "local",
      barberoId: "",
      tipo: "un_dia",
      fecha: "",
      desde: "",
      hasta: "",
      motivo: "",
    },
  });

  const alcance = watch("alcance");
  const tipo = watch("tipo");

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createBloqueoAction({
        alcance: data.alcance,
        barberoId: data.alcance === "barbero" ? data.barberoId ?? "" : "",
        tipo: data.tipo,
        fecha: data.tipo === "un_dia" ? data.fecha ?? "" : "",
        desde: data.tipo === "varios_dias" ? data.desde ?? "" : "",
        hasta: data.tipo === "varios_dias" ? data.hasta ?? "" : "",
        motivo: data.motivo ?? "",
      });

      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      router.refresh();
      onCancel(); // Cierra el form al guardar OK.
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-5 rounded-md border border-border bg-card p-5"
      aria-busy={pending}
    >
      {/* Alcance */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {COPY.admin.bloqueos.alcance}
        </legend>
        <div className="flex flex-wrap gap-2">
          <RadioCard
            label={COPY.admin.bloqueos.alcanceBarbero}
            value="barbero"
            currentValue={alcance}
            register={register("alcance")}
            disabled={barberos.length === 0}
          />
          <RadioCard
            label={COPY.admin.bloqueos.alcanceLocal}
            value="local"
            currentValue={alcance}
            register={register("alcance")}
          />
        </div>
      </fieldset>

      {alcance === "barbero" ? (
        <div className="space-y-2">
          <Label htmlFor="barberoId">{COPY.admin.bloqueos.barberoLabel}</Label>
          <select
            id="barberoId"
            aria-invalid={errors.barberoId ? "true" : "false"}
            aria-describedby={errors.barberoId ? "barberoId-error" : undefined}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm"
            {...register("barberoId")}
          >
            <option value="">{COPY.admin.bloqueos.barberoPlaceholder}</option>
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
      ) : null}

      {/* Tipo */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {COPY.admin.bloqueos.tipo}
        </legend>
        <div className="flex flex-wrap gap-2">
          <RadioCard
            label={COPY.admin.bloqueos.tipoUnDia}
            value="un_dia"
            currentValue={tipo}
            register={register("tipo")}
          />
          <RadioCard
            label={COPY.admin.bloqueos.tipoVariosDias}
            value="varios_dias"
            currentValue={tipo}
            register={register("tipo")}
          />
        </div>
      </fieldset>

      {/* Fechas */}
      {tipo === "un_dia" ? (
        <div className="space-y-2">
          <Label htmlFor="fecha">{COPY.admin.bloqueos.fecha}</Label>
          <Input
            id="fecha"
            type="date"
            aria-invalid={errors.fecha ? "true" : "false"}
            aria-describedby={errors.fecha ? "fecha-error" : undefined}
            {...register("fecha")}
          />
          {errors.fecha ? (
            <p id="fecha-error" role="alert" className="text-sm text-destructive">
              {errors.fecha.message}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="desde">{COPY.admin.bloqueos.desde}</Label>
            <Input
              id="desde"
              type="date"
              aria-invalid={errors.desde ? "true" : "false"}
              aria-describedby={errors.desde ? "desde-error" : undefined}
              {...register("desde")}
            />
            {errors.desde ? (
              <p
                id="desde-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.desde.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="hasta">{COPY.admin.bloqueos.hasta}</Label>
            <Input
              id="hasta"
              type="date"
              aria-invalid={errors.hasta ? "true" : "false"}
              aria-describedby={errors.hasta ? "hasta-error" : undefined}
              {...register("hasta")}
            />
            {errors.hasta ? (
              <p
                id="hasta-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.hasta.message}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Motivo */}
      <div className="space-y-2">
        <Label htmlFor="motivo">{COPY.admin.bloqueos.motivo}</Label>
        <textarea
          id="motivo"
          rows={2}
          placeholder={COPY.admin.bloqueos.motivoPlaceholder}
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
          {pending ? COPY.admin.bloqueos.creando : COPY.admin.bloqueos.crear}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          {COPY.admin.bloqueos.cancelarNuevo}
        </Button>
      </div>
    </form>
  );
}

type RadioCardProps = {
  label: string;
  value: string;
  currentValue: string;
  register: UseFormRegisterReturn;
  disabled?: boolean;
};

/**
 * Radio en estilo "card" (look + accesibilidad como radio nativo via input visually-hidden).
 */
function RadioCard({
  label,
  value,
  currentValue,
  register,
  disabled,
}: RadioCardProps) {
  const active = currentValue === value;
  return (
    <label
      className={cn(
        "inline-flex h-11 cursor-pointer items-center rounded-md border px-4 text-sm font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <input
        type="radio"
        value={value}
        className="sr-only"
        disabled={disabled}
        {...register}
      />
      {label}
    </label>
  );
}
