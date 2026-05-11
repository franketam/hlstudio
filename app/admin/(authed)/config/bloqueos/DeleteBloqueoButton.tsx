"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import { deleteBloqueoAction } from "./actions";

type Props = {
  id: string;
};

/**
 * Botón cliente con `confirm()` antes de invocar el server action.
 * Evitamos un form server-action porque queremos confirmación previa.
 */
export function DeleteBloqueoButton({ id }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (!window.confirm(COPY.admin.bloqueos.confirmarEliminar)) return;
    startTransition(async () => {
      const res = await deleteBloqueoAction(id);
      if (!res.ok) {
        window.alert(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      {pending ? COPY.admin.bloqueos.eliminando : COPY.admin.bloqueos.eliminar}
    </Button>
  );
}
