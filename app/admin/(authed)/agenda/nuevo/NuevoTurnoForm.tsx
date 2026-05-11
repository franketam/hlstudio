"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPY } from "@/lib/constants";
import {
  createTurnoAdminAction,
  getSlotsAdminAction,
  lookupClienteAction,
  type SlotAdmin,
} from "../actions";

type BarberoOption = {
  id: string;
  nombre: string;
  orden: number;
};

type ServicioOption = {
  id: string;
  nombre: string;
  duracionMin: number;
  orden: number;
};

type Props = {
  barberos: BarberoOption[];
  servicios: ServicioOption[];
  /** Mapa "barberoId__servicioId" → precio. */
  precios: Record<string, string>;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validación cliente. El server vuelve a validar todo (no confiar).
 * Email vacío string se transforma a "" — el server lo trata como null.
 */
const clientSchema = z.object({
  barberoId: z.string().uuid("Elegí un barbero."),
  servicioId: z.string().uuid("Elegí un servicio."),
  fecha: z.string().regex(YMD_RE, "Fecha inválida."),
  /** ISO UTC del slot elegido. */
  inicioIso: z.string().min(10, "Elegí un horario."),
  clienteTelefono: z.string().trim().min(6, "Ingresá un teléfono válido."),
  clienteNombre: z.string().trim().min(2, "Ingresá el nombre del cliente."),
  clienteEmail: z
    .string()
    .trim()
    .email("Email inválido.")
    .optional()
    .or(z.literal("")),
  pagoEnLocal: z.boolean(),
});

type FormData = z.infer<typeof clientSchema>;

/** "YYYY-MM-DD" de hoy en TZ del navegador. Suficiente para el default. */
function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function NuevoTurnoForm({ barberos, servicios, precios }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotAdmin[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [clienteEncontrado, setClienteEncontrado] = useState<boolean>(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      barberoId: "",
      servicioId: "",
      fecha: todayYmd(),
      inicioIso: "",
      clienteTelefono: "",
      clienteNombre: "",
      clienteEmail: "",
      pagoEnLocal: false,
    },
  });

  const barberoId = watch("barberoId");
  const servicioId = watch("servicioId");
  const fecha = watch("fecha");
  const inicioIso = watch("inicioIso");
  const clienteTelefono = watch("clienteTelefono");

  // Filtrar servicios disponibles para el barbero seleccionado (los que tienen
  // precio cargado). Si no hay barbero elegido, mostramos todos pero el submit
  // queda gateado por la validación del schema.
  const serviciosDisponibles = useMemo(() => {
    if (!barberoId) return servicios;
    return servicios.filter((s) => precios[`${barberoId}__${s.id}`]);
  }, [barberoId, servicios, precios]);

  const barberoHasPrecios = useMemo(() => {
    if (!barberoId) return true;
    return serviciosDisponibles.length > 0;
  }, [barberoId, serviciosDisponibles]);

  // Si cambia el barbero y el servicio elegido ya no es compatible, limpiar.
  useEffect(() => {
    if (!barberoId || !servicioId) return;
    const ok = precios[`${barberoId}__${servicioId}`];
    if (!ok) {
      setValue("servicioId", "");
      setValue("inicioIso", "");
    }
  }, [barberoId, servicioId, precios, setValue]);

  // Re-fetchear slots cada vez que cambia barbero/servicio/fecha.
  useEffect(() => {
    if (!barberoId || !servicioId || !fecha || !YMD_RE.test(fecha)) {
      setSlots([]);
      setSlotsError(null);
      return;
    }

    let aborted = false;
    setSlotsLoading(true);
    setSlotsError(null);
    setValue("inicioIso", ""); // limpio slot al cambiar input

    (async () => {
      const res = await getSlotsAdminAction({
        barberoId,
        servicioId,
        fecha,
      });
      if (aborted) return;
      if (!res.ok) {
        setSlots([]);
        setSlotsError(res.error.message);
      } else {
        setSlots(res.data.slots);
        setSlotsError(null);
      }
      setSlotsLoading(false);
    })();

    return () => {
      aborted = true;
    };
  }, [barberoId, servicioId, fecha, setValue]);

  // Lookup de cliente por teléfono, con debounce. No bloquea el submit —
  // si el cliente no existe, simplemente no se autocompleta.
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const tel = clienteTelefono?.trim() ?? "";
    if (tel.length < 6) {
      setClienteEncontrado(false);
      return;
    }
    lookupTimer.current = setTimeout(async () => {
      const res = await lookupClienteAction({ telefono: tel });
      if (!res.ok) return;
      const cli = res.data.cliente;
      if (cli) {
        setClienteEncontrado(true);
        setValue("clienteNombre", cli.nombre, { shouldValidate: false });
        setValue("clienteEmail", cli.email ?? "", { shouldValidate: false });
      } else {
        setClienteEncontrado(false);
      }
    }, 500);

    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [clienteTelefono, setValue]);

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createTurnoAdminAction({
        barberoId: data.barberoId,
        servicioId: data.servicioId,
        inicioIso: data.inicioIso,
        cliente: {
          nombre: data.clienteNombre,
          telefono: data.clienteTelefono,
          email: data.clienteEmail ?? "",
        },
        pagoEnLocal: data.pagoEnLocal,
      });

      if (!res.ok) {
        setServerError(res.error.message);
        // Si el slot quedó ocupado, refresco la lista para que el admin elija otro.
        if (res.error.code === "slot_ocupado") {
          const refresh = await getSlotsAdminAction({
            barberoId: data.barberoId,
            servicioId: data.servicioId,
            fecha: data.fecha,
          });
          if (refresh.ok) {
            setSlots(refresh.data.slots);
            setValue("inicioIso", "");
          }
        }
        return;
      }
      router.push(`/admin/agenda?fecha=${data.fecha}`);
      router.refresh();
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
        <Label htmlFor="barberoId">{COPY.admin.nuevoTurno.barbero}</Label>
        <select
          id="barberoId"
          aria-invalid={errors.barberoId ? "true" : "false"}
          aria-describedby={errors.barberoId ? "barberoId-error" : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm"
          {...register("barberoId")}
        >
          <option value="">{COPY.admin.nuevoTurno.barberoPlaceholder}</option>
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

      {/* Servicio */}
      <div className="space-y-2">
        <Label htmlFor="servicioId">{COPY.admin.nuevoTurno.servicio}</Label>
        <select
          id="servicioId"
          aria-invalid={errors.servicioId ? "true" : "false"}
          aria-describedby={errors.servicioId ? "servicioId-error" : undefined}
          disabled={!barberoHasPrecios}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          {...register("servicioId")}
        >
          <option value="">{COPY.admin.nuevoTurno.servicioPlaceholder}</option>
          {serviciosDisponibles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre} ({s.duracionMin} min)
            </option>
          ))}
        </select>
        {!barberoHasPrecios ? (
          <p className="text-sm text-destructive">
            {COPY.admin.nuevoTurno.servicioSinPrecio}
          </p>
        ) : null}
        {errors.servicioId ? (
          <p
            id="servicioId-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.servicioId.message}
          </p>
        ) : null}
      </div>

      {/* Fecha */}
      <div className="space-y-2">
        <Label htmlFor="fecha">{COPY.admin.nuevoTurno.fecha}</Label>
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

      {/* Hora */}
      <div className="space-y-2">
        <Label>{COPY.admin.nuevoTurno.hora}</Label>
        {!barberoId || !servicioId ? (
          <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            {COPY.admin.nuevoTurno.elegiBarberoServicio}
          </p>
        ) : slotsLoading ? (
          <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            {COPY.admin.nuevoTurno.cargandoSlots}
          </p>
        ) : slotsError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {slotsError}
          </p>
        ) : slots.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            {COPY.admin.nuevoTurno.sinSlots}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => {
              const active = inicioIso === s.inicioIso;
              return (
                <button
                  key={s.inicioIso}
                  type="button"
                  onClick={() => setValue("inicioIso", s.inicioIso)}
                  className={
                    "numeral flex h-11 items-center justify-center rounded-md border text-base font-medium transition-colors " +
                    (active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent")
                  }
                >
                  {s.slot}
                </button>
              );
            })}
          </div>
        )}
        <input type="hidden" {...register("inicioIso")} />
        {errors.inicioIso ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.inicioIso.message}
          </p>
        ) : null}
      </div>

      {/* Cliente */}
      <fieldset className="space-y-3 border-t border-border pt-5">
        <legend className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {COPY.admin.nuevoTurno.cliente}
        </legend>

        <div className="space-y-2">
          <Label htmlFor="clienteTelefono">
            {COPY.admin.nuevoTurno.clienteTelefono}
          </Label>
          <Input
            id="clienteTelefono"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder={COPY.admin.nuevoTurno.clienteTelefonoPlaceholder}
            aria-invalid={errors.clienteTelefono ? "true" : "false"}
            aria-describedby={
              errors.clienteTelefono ? "clienteTelefono-error" : "clienteTelefono-hint"
            }
            {...register("clienteTelefono")}
          />
          {clienteEncontrado ? (
            <p
              id="clienteTelefono-hint"
              className="text-xs text-foreground"
              aria-live="polite"
            >
              {COPY.admin.nuevoTurno.clienteEncontrado}
            </p>
          ) : (
            <p id="clienteTelefono-hint" className="text-xs text-muted-foreground">
              {COPY.admin.nuevoTurno.clienteTelefonoHint}
            </p>
          )}
          {errors.clienteTelefono ? (
            <p
              id="clienteTelefono-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.clienteTelefono.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="clienteNombre">
            {COPY.admin.nuevoTurno.clienteNombre}
          </Label>
          <Input
            id="clienteNombre"
            autoComplete="name"
            placeholder={COPY.admin.nuevoTurno.clienteNombrePlaceholder}
            aria-invalid={errors.clienteNombre ? "true" : "false"}
            aria-describedby={
              errors.clienteNombre ? "clienteNombre-error" : undefined
            }
            {...register("clienteNombre")}
          />
          {errors.clienteNombre ? (
            <p
              id="clienteNombre-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.clienteNombre.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="clienteEmail">
            {COPY.admin.nuevoTurno.clienteEmail}
          </Label>
          <Input
            id="clienteEmail"
            type="email"
            autoComplete="email"
            placeholder={COPY.admin.nuevoTurno.clienteEmailPlaceholder}
            aria-invalid={errors.clienteEmail ? "true" : "false"}
            aria-describedby={
              errors.clienteEmail ? "clienteEmail-error" : undefined
            }
            {...register("clienteEmail")}
          />
          {errors.clienteEmail ? (
            <p
              id="clienteEmail-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.clienteEmail.message}
            </p>
          ) : null}
        </div>
      </fieldset>

      {/* Pago */}
      <div className="space-y-1 border-t border-border pt-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 cursor-pointer accent-foreground"
            {...register("pagoEnLocal")}
          />
          <span className="text-sm">
            <span className="font-medium">
              {COPY.admin.nuevoTurno.pagoEnLocal}
            </span>
            <span className="block text-xs text-muted-foreground">
              {COPY.admin.nuevoTurno.pagoEnLocalHint}
            </span>
          </span>
        </label>
      </div>

      {serverError ? (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending
            ? COPY.admin.nuevoTurno.creando
            : COPY.admin.nuevoTurno.crear}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/admin/agenda")}
          disabled={pending}
        >
          {COPY.admin.nuevoTurno.cancelar}
        </Button>
      </div>
    </form>
  );
}
