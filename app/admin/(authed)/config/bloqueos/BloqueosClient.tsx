"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import { BloqueoForm } from "./BloqueoForm";

type BarberoOption = {
  id: string;
  nombre: string;
};

type Props = {
  barberos: BarberoOption[];
};

/**
 * Wrapper cliente para alternar el form inline.
 * La lista en sí es server-rendered en page.tsx (mejor SEO/cache + menos JS al cliente).
 */
export function BloqueosClient({ barberos }: Props) {
  const [showForm, setShowForm] = useState(false);

  if (showForm) {
    return (
      <div className="mb-6">
        <BloqueoForm
          barberos={barberos}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <Button onClick={() => setShowForm(true)}>
        {COPY.admin.bloqueos.nuevo}
      </Button>
    </div>
  );
}
