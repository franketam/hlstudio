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
  createBarberoAction,
  updateBarberoAction,
} from "@/app/admin/(authed)/config/barberos/actions";

const clientSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  fotoUrl: z
    .string()
    .trim()
    .max(2048, "URL demasiado larga.")
    .refine(
      (v) => v === "" || /^https?:\/\/.+/i.test(v),
      "La foto debe ser una URL válida (https://...)."
    )
    .optional(),
  descripcion: z.string().trim().max(500, "Máximo 500 caracteres.").optional(),
  email: z
    .string()
    .trim()
    .max(254, "Email demasiado largo.")
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Ingresá un email válido."
    )
    .optional(),
  orden: z.coerce
    .number({ invalid_type_error: "Ingresá un número." })
    .int()
    .min(0, "El orden no puede ser negativo.")
    .max(999, "Orden demasiado alto."),
});

type FormData = z.infer<typeof clientSchema>;

type Props = {
  mode: "create" | "edit";
  barberoId?: string;
  defaultValues?: Partial<FormData>;
};

export function BarberoForm({ mode, barberoId, defaultValues }: Props) {
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
      fotoUrl: defaultValues?.fotoUrl ?? "",
      descripcion: defaultValues?.descripcion ?? "",
      email: defaultValues?.email ?? "",
      orden: defaultValues?.orden ?? 0,
    },
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const payload = {
        nombre: data.nombre,
        fotoUrl: data.fotoUrl ?? "",
        descripcion: data.descripcion ?? "",
        email: data.email ?? "",
        orden: data.orden,
      };

      const res =
        mode === "create"
          ? await createBarberoAction(payload)
          : await updateBarberoAction(barberoId ?? "", payload);

      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      router.push("/admin/config/barberos");
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
        <Label htmlFor="nombre">{COPY.admin.barberos.form.nombre}</Label>
        <Input
          id="nombre"
          autoComplete="off"
          placeholder={COPY.admin.barberos.form.nombrePlaceholder}
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
        <Label htmlFor="fotoUrl">{COPY.admin.barberos.form.fotoUrl}</Label>
        <Input
          id="fotoUrl"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://..."
          aria-invalid={errors.fotoUrl ? "true" : "false"}
          aria-describedby={errors.fotoUrl ? "fotoUrl-error" : "fotoUrl-hint"}
          {...register("fotoUrl")}
        />
        <p id="fotoUrl-hint" className="text-xs text-muted-foreground">
          {COPY.admin.barberos.form.fotoUrlHint}
        </p>
        {errors.fotoUrl ? (
          <p
            id="fotoUrl-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.fotoUrl.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="descripcion">
          {COPY.admin.barberos.form.descripcion}
        </Label>
        <textarea
          id="descripcion"
          rows={3}
          placeholder={COPY.admin.barberos.form.descripcionPlaceholder}
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
        <Label htmlFor="email">{COPY.admin.barberos.form.email}</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="hugo@hlstudio.com.ar"
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "email-error" : "email-hint"}
          {...register("email")}
        />
        <p id="email-hint" className="text-xs text-muted-foreground">
          {COPY.admin.barberos.form.emailHint}
        </p>
        {errors.email ? (
          <p id="email-error" role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="orden">{COPY.admin.barberos.form.orden}</Label>
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
          {COPY.admin.barberos.form.ordenHint}
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
          <Link href="/admin/config/barberos">{COPY.cta.cancelar}</Link>
        </Button>
      </div>
    </form>
  );
}
