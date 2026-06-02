"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import { toggleBloqueoRecurrenteAction } from "./actions";

type Props = {
  id: string;
  activo: boolean;
};

/**
 * Botón cliente para activar/desactivar un bloqueo recurrente sin borrarlo.
 * Pasa el estado deseado explícito (NOT del actual) para evitar carreras.
 */
export function ToggleBloqueoRecurrenteButton({ id, activo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await toggleBloqueoRecurrenteAction(id, !activo);
      if (!res.ok) {
        window.alert(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  const label = activo
    ? COPY.admin.bloqueosRecurrentes.desactivar
    : COPY.admin.bloqueosRecurrentes.activar;

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-foreground"
    >
      {pending ? COPY.admin.bloqueosRecurrentes.actualizando : label}
    </Button>
  );
}
