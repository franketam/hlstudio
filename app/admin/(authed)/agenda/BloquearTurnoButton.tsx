"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { bloquearDesdeTurnoAction } from "./actions";

type Props = {
  turnoId: string;
  resumen: string;
  ip: string | null;
  email: string | null;
  telefono: string;
  /** Si el turno sigue confirmado, se ofrece cancelarlo en el mismo paso. */
  cancelable: boolean;
};

/**
 * Bloquea los identificadores de un turno para el formulario público.
 *
 * Se despliega en panel en vez de abrir un modal porque el dueño tiene que VER
 * qué va a bloquear antes de confirmar: la IP puede ser compartida (un wifi
 * familiar, el del local) y bloquearla a ciegas se lleva puestos clientes
 * reales. Por eso los tres datos van a la vista y con checkbox.
 */
export function BloquearTurnoButton({
  turnoId,
  resumen,
  ip,
  email,
  telefono,
  cancelable,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [bloquearIp, setBloquearIp] = useState(Boolean(ip));
  const [bloquearEmail, setBloquearEmail] = useState(Boolean(email));
  const [bloquearTelefono, setBloquearTelefono] = useState(true);
  const [cancelarTurno, setCancelarTurno] = useState(cancelable);
  const [motivo, setMotivo] = useState("");

  const nadaSeleccionado = !bloquearIp && !bloquearEmail && !bloquearTelefono;

  const onConfirmar = () => {
    setServerError(null);
    startTransition(async () => {
      const res = await bloquearDesdeTurnoAction({
        turnoId,
        bloquearIp,
        bloquearEmail,
        bloquearTelefono,
        motivo,
        cancelarTurno,
      });
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  };

  if (!abierto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAbierto(true)}
      >
        Bloquear
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-destructive/40 bg-destructive/5 p-4 text-left">
      <div className="text-[10px] uppercase tracking-[0.2em] text-destructive">
        Bloquear para reservas online
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{resumen}</p>

      <div className="mt-3 space-y-2">
        <Fila
          checked={bloquearTelefono}
          onChange={setBloquearTelefono}
          label="Teléfono"
          valor={telefono}
        />
        <Fila
          checked={bloquearEmail}
          onChange={setBloquearEmail}
          label="Email"
          valor={email}
          faltanteHint="el cliente no tiene email cargado"
        />
        <Fila
          checked={bloquearIp}
          onChange={setBloquearIp}
          label="IP"
          valor={ip}
          faltanteHint="turno viejo o cargado desde el panel"
        />
      </div>

      {ip ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Ojo con la IP: si es un wifi compartido, podés estar bloqueando a otras
          personas de la misma red.
        </p>
      ) : null}

      <input
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (opcional)"
        maxLength={300}
        className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      {cancelable ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cancelarTurno}
            onChange={(e) => setCancelarTurno(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Cancelar también este turno (no se le avisa al cliente)</span>
        </label>
      ) : null}

      {serverError ? (
        <p role="alert" aria-live="polite" className="mt-2 text-xs text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onConfirmar}
          disabled={pending || nadaSeleccionado}
        >
          {pending ? "Bloqueando..." : "Confirmar bloqueo"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbierto(false)}
          disabled={pending}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function Fila({
  checked,
  onChange,
  label,
  valor,
  faltanteHint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  valor: string | null;
  faltanteHint?: string;
}) {
  if (!valor) {
    return (
      <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
        <span className="w-20 shrink-0">{label}</span>
        <span className="italic">— sin dato{faltanteHint ? ` (${faltanteHint})` : ""}</span>
      </div>
    );
  }

  return (
    <label className="flex items-baseline gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 self-center"
      />
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="numeral break-all font-medium">{valor}</span>
    </label>
  );
}
