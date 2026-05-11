"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelTurnoAction } from "@/app/turno/[token]/actions";

type Props = {
  token: string;
};

export function CancelarTurnoButton({ token }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const onCancelar = () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm("¿Seguro que querés cancelar el turno?");
      if (!ok) return;
    }
    setServerError(null);
    startTransition(async () => {
      const res = await cancelTurnoAction(token);
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="destructive"
        size="lg"
        className="w-full"
        onClick={onCancelar}
        disabled={pending}
      >
        {pending ? "Cancelando..." : "Cancelar turno"}
      </Button>
      {serverError ? (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}
    </div>
  );
}
