"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelTurnoAdminAction } from "./actions";

type Props = {
  turnoId: string;
  /** Resumen humano del turno para confirmar (ej: "10:15 — Leito · Corte"). */
  resumen: string;
};

export function CancelarTurnoAdminButton({ turnoId, resumen }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const onClick = () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(`¿Cancelar el turno ${resumen}?`);
      if (!ok) return;
    }
    setServerError(null);
    startTransition(async () => {
      const res = await cancelTurnoAdminAction({ turnoId });
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "Cancelando..." : "Cancelar turno"}
      </Button>
      {serverError ? (
        <p role="alert" aria-live="polite" className="text-xs text-destructive">
          {serverError}
        </p>
      ) : null}
    </div>
  );
}
