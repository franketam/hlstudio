"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { COPY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { updateClienteNotasAction } from "./actions";

const MAX_CHARS = 2000;

type Props = {
  clienteId: string;
  notasIniciales: string;
};

/**
 * Form de notas internas del cliente. Inline (sin modal).
 *  - Debe ser client porque maneja estado del textarea, contador, server error.
 *  - El botón "Guardar" se habilita solo cuando hay cambios respecto del valor
 *    inicial — evita guardadas accidentales.
 *  - Mensaje "Notas guardadas" se autoclear a los 3s.
 */
export function NotasClienteForm({ clienteId, notasIniciales }: Props) {
  const [value, setValue] = useState(notasIniciales);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync si el server cambia el valor (revalidate después de guardar).
  useEffect(() => {
    setValue(notasIniciales);
  }, [notasIniciales]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const tieneCambios = value.trim() !== notasIniciales.trim();
  const charsRestantes = MAX_CHARS - value.length;
  const excedeLimite = charsRestantes < 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tieneCambios || excedeLimite) return;
    setServerError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await updateClienteNotasAction({ id: clienteId, notas: value });
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      setSavedAt(Date.now());
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSavedAt(null), 3000);
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-border bg-card p-5"
      aria-busy={pending}
    >
      <div className="mb-3">
        <h2 className="display-tight text-xl sm:text-2xl">
          {COPY.admin.clientes.notas.title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {COPY.admin.clientes.notas.subtitle}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notas" className="sr-only">
          {COPY.admin.clientes.notas.title}
        </Label>
        <textarea
          id="notas"
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={COPY.admin.clientes.notas.placeholder}
          aria-invalid={excedeLimite ? "true" : "false"}
          className="flex w-full rounded-md border border-input bg-background px-3.5 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
        <div
          className={cn(
            "text-right text-xs",
            excedeLimite ? "text-destructive" : "text-muted-foreground"
          )}
          aria-live="polite"
        >
          {value.length} / {MAX_CHARS}
        </div>
      </div>

      {serverError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || !tieneCambios || excedeLimite}
        >
          {pending
            ? COPY.admin.clientes.notas.guardando
            : COPY.admin.clientes.notas.guardar}
        </Button>
        {savedAt ? (
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-muted-foreground"
          >
            {COPY.admin.clientes.notas.guardadoOk}
          </span>
        ) : null}
      </div>
    </form>
  );
}
