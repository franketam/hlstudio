"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTurnoAction } from "@/app/reservar/datos/actions";

const formSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre completo."),
  telefono: z.string().trim().min(6, "Ingresá un teléfono válido."),
  email: z.string().trim().email("Ingresá un email válido."),
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  barberoId: string;
  servicioId: string;
  inicioIso: string;
};

export function DatosForm({ barberoId, servicioId, inicioIso }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { nombre: "", telefono: "", email: "" },
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createTurnoAction({
        barberoId,
        servicioId,
        inicioIso,
        cliente: data,
      });
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      router.push(`/turno/${encodeURIComponent(res.data.cancelToken)}?nuevo=1`);
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
        <Label htmlFor="nombre">Nombre y apellido</Label>
        <Input
          id="nombre"
          autoComplete="name"
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
        <Label htmlFor="telefono">Teléfono</Label>
        <Input
          id="telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="11 5555-5555"
          aria-invalid={errors.telefono ? "true" : "false"}
          aria-describedby={errors.telefono ? "telefono-error" : undefined}
          {...register("telefono")}
        />
        {errors.telefono ? (
          <p id="telefono-error" role="alert" className="text-sm text-destructive">
            {errors.telefono.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="email-error" role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending}
      >
        {pending ? "Confirmando..." : "Confirmar turno"}
      </Button>
    </form>
  );
}
