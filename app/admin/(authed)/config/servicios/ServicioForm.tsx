"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPY } from "@/lib/constants";
import {
  createServicioAction,
  updateServicioAction,
} from "@/app/admin/(authed)/config/servicios/actions";

/**
 * Form reutilizable para crear/editar servicios.
 * Schema cliente espejo del server. El server vuelve a validar.
 */
const clientSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  duracionMin: z.coerce
    .number({ invalid_type_error: "Ingresá un número." })
    .int("La duración debe ser entera.")
    .min(5, "La duración mínima es 5 minutos.")
    .max(480, "La duración máxima es 480 minutos."),
  descripcion: z.string().trim().max(500, "Máximo 500 caracteres.").optional(),
  orden: z.coerce
    .number({ invalid_type_error: "Ingresá un número." })
    .int()
    .min(0, "El orden no puede ser negativo.")
    .max(999, "Orden demasiado alto."),
});

type FormData = z.infer<typeof clientSchema>;

type Props = {
  mode: "create" | "edit";
  servicioId?: string;
  defaultValues?: Partial<FormData>;
};

export function ServicioForm({ mode, servicioId, defaultValues }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      nombre: defaultValues?.nombre ?? "",
      duracionMin: defaultValues?.duracionMin ?? 30,
      descripcion: defaultValues?.descripcion ?? "",
      orden: defaultValues?.orden ?? 0,
    },
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const payload = {
        nombre: data.nombre,
        duracionMin: data.duracionMin,
        descripcion: data.descripcion ?? "",
        orden: data.orden,
      };

      const res =
        mode === "create"
          ? await createServicioAction(payload)
          : await updateServicioAction(servicioId ?? "", payload);

      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      router.push("/admin/config/servicios");
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-5"
      aria-busy={pending}
    >
      <div className="space-y-2">
        <Label htmlFor="nombre">{COPY.admin.servicios.form.nombre}</Label>
        <Input
          id="nombre"
          autoComplete="off"
          placeholder={COPY.admin.servicios.form.nombrePlaceholder}
          aria-invalid={errors.nombre ? "true" : "false"}
          aria-describedby={errors.nombre ? "nombre-error" : undefined}
          {...register("nombre")}
        />
        {errors.nombre ? (
          <p id="nombre-error" role="alert" className="text-sm text-destructive">
            {errors.nombre.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="duracionMin">
          {COPY.admin.servicios.form.duracion}
        </Label>
        <Input
          id="duracionMin"
          type="number"
          inputMode="numeric"
          min={5}
          max={480}
          step={5}
          aria-invalid={errors.duracionMin ? "true" : "false"}
          aria-describedby={
            errors.duracionMin ? "duracion-error" : "duracion-hint"
          }
          {...register("duracionMin")}
        />
        <p id="duracion-hint" className="text-xs text-muted-foreground">
          {COPY.admin.servicios.form.duracionHint}
        </p>
        {errors.duracionMin ? (
          <p
            id="duracion-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.duracionMin.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="descripcion">
          {COPY.admin.servicios.form.descripcion}
        </Label>
        <textarea
          id="descripcion"
          rows={3}
          placeholder={COPY.admin.servicios.form.descripcionPlaceholder}
          aria-invalid={errors.descripcion ? "true" : "false"}
          aria-describedby={
            errors.descripcion ? "descripcion-error" : undefined
          }
          className="flex w-full rounded-md border border-input bg-background px-3.5 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          {...register("descripcion")}
        />
        {errors.descripcion ? (
          <p
            id="descripcion-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.descripcion.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="orden">{COPY.admin.servicios.form.orden}</Label>
        <Input
          id="orden"
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          step={1}
          aria-invalid={errors.orden ? "true" : "false"}
          aria-describedby={errors.orden ? "orden-error" : "orden-hint"}
          {...register("orden")}
        />
        <p id="orden-hint" className="text-xs text-muted-foreground">
          {COPY.admin.servicios.form.ordenHint}
        </p>
        {errors.orden ? (
          <p id="orden-error" role="alert" className="text-sm text-destructive">
            {errors.orden.message}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? COPY.cta.creando
              : COPY.cta.guardando
            : mode === "create"
              ? COPY.cta.crear
              : COPY.cta.guardar}
        </Button>
        <Button asChild variant="ghost" type="button">
          <Link href="/admin/config/servicios">{COPY.cta.cancelar}</Link>
        </Button>
      </div>
    </form>
  );
}
