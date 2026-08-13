"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertModal } from "@/components/ui/alert-modal";
import { COPY } from "@/lib/constants";
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

/**
 * Rechazo por validación. Va en un modal en vez de como texto al pie: al pie de
 * un formulario largo el cliente no lo ve y reintenta igual.
 *
 * El server manda un único código genérico para todos los motivos, así que acá
 * no hay nada que ramificar — es a propósito, ver ERROR_RESERVA_RECHAZADA en
 * server/actions/booking.ts.
 */
const CODIGO_RECHAZO = "reserva_rechazada";

export function DatosForm({ barberoId, servicioId, inicioIso }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mensajeRechazo, setMensajeRechazo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { nombre: "", telefono: "", email: "" },
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    setMensajeRechazo(null);
    startTransition(async () => {
      const res = await createTurnoAction({
        barberoId,
        servicioId,
        inicioIso,
        cliente: data,
      });
      if (!res.ok) {
        if (res.error.code === CODIGO_RECHAZO) {
          setMensajeRechazo(res.error.message);
        } else {
          setServerError(res.error.message);
        }
        return;
      }
      router.push(`/turno/${encodeURIComponent(res.data.cancelToken)}?nuevo=1`);
    });
  };

  const copyRechazo = COPY.reservar.errorRechazo;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      aria-busy={pending}
    >
      <div className="space-y-2">
        <Label htmlFor="nombre">
          Nombre y apellido <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="nombre"
          autoComplete="name"
          required
          aria-required="true"
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
        <Label htmlFor="telefono">
          Teléfono <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="11 5555-5555"
          required
          aria-required="true"
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
        <Label htmlFor="email">
          Email <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-required="true"
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

      {/*
        Cuelga del form porque es la validación del form, pero `AlertModal` se
        renderiza por portal a <body>: en el DOM no queda adentro del <form>.
      */}
      <AlertModal
        open={mensajeRechazo !== null}
        titulo={copyRechazo.titulo}
        mensaje={mensajeRechazo ?? ""}
        detalles={[copyRechazo.ayuda]}
        textoCerrar={copyRechazo.cerrar}
        onClose={() => setMensajeRechazo(null)}
        // Al cerrar, el foco va al teléfono: es el campo que más veces lo causa,
        // aunque el modal no lo diga.
        enfocarAlCerrar={() => setFocus("telefono")}
      />
    </form>
  );
}
