"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import { BloqueoRecurrenteForm } from "./BloqueoRecurrenteForm";

type BarberoOption = {
  id: string;
  nombre: string;
};

type Props = {
  barberos: BarberoOption[];
};

/**
 * Wrapper cliente para alternar el form inline.
 * La lista en sí es server-rendered en page.tsx.
 */
export function BloqueosRecurrentesClient({ barberos }: Props) {
  const [showForm, setShowForm] = useState(false);

  if (barberos.length === 0) {
    return (
      <div className="mb-6 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        {COPY.admin.bloqueosRecurrentes.sinBarberos}
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="mb-6">
        <BloqueoRecurrenteForm
          barberos={barberos}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <Button onClick={() => setShowForm(true)}>
        {COPY.admin.bloqueosRecurrentes.nuevo}
      </Button>
    </div>
  );
}
