"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { crearBloqueoAction, desbloquearAction } from "./actions";

export type BloqueoRow = {
  id: string;
  tipo: string;
  valor: string;
  motivo: string | null;
  createdAt: Date;
};

const TIPOS = [
  { value: "telefono", label: "Teléfono" },
  { value: "email", label: "Email" },
  { value: "ip", label: "IP" },
] as const;

const PLACEHOLDER: Record<string, string> = {
  telefono: "2346 55-5555",
  email: "alguien@ejemplo.com",
  ip: "190.15.225.6",
};

export function BloqueosAccesoClient({ bloqueos }: { bloqueos: BloqueoRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<string>("telefono");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");

  const onCrear = () => {
    setError(null);
    startTransition(async () => {
      const res = await crearBloqueoAction({
        tipo: tipo as "ip" | "email" | "telefono",
        valor,
        motivo,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setValor("");
      setMotivo("");
      router.refresh();
    });
  };

  const onDesbloquear = (id: string, valorMostrado: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `¿Desbloquear ${valorMostrado}? Va a poder volver a reservar online.`
      );
      if (!ok) return;
    }
    setError(null);
    startTransition(async () => {
      const res = await desbloquearAction({ id });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-md border border-border p-4">
        <h2 className="text-sm font-medium">Bloquear a mano</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Para bloquear algo que todavía no reservó. Lo habitual es hacerlo desde
          el turno en la agenda, que bloquea teléfono, email e IP de una.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={PLACEHOLDER[tipo]}
            className="h-9 min-w-[12rem] flex-1 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
            maxLength={300}
            className="h-9 min-w-[12rem] flex-1 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            onClick={onCrear}
            disabled={pending || valor.trim().length < 3}
          >
            {pending ? "Guardando..." : "Bloquear"}
          </Button>
        </div>

        {error ? (
          <p role="alert" aria-live="polite" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">
          Bloqueos activos ({bloqueos.length})
        </h2>

        {bloqueos.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No hay nada bloqueado.
          </div>
        ) : (
          <ul className="space-y-2">
            {bloqueos.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-card p-3"
              >
                <span className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {b.tipo}
                </span>
                <span className="numeral break-all font-medium">{b.valor}</span>
                {b.motivo ? (
                  <span className="text-sm text-muted-foreground">{b.motivo}</span>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {b.createdAt.toLocaleDateString("es-AR")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onDesbloquear(b.id, `${b.tipo} ${b.valor}`)}
                  disabled={pending}
                >
                  Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
