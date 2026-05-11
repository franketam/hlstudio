"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPY } from "@/lib/constants";

type Props = {
  defaultValue: string;
};

/**
 * Caja de búsqueda URL-driven. La fuente de verdad sigue siendo `searchParams`
 * en el server component; este input solo se encarga de:
 *  - reflejar `defaultValue` al montar,
 *  - actualizar la URL con `router.replace` tras 300ms de inactividad,
 *  - usar `useTransition` para no bloquear el input mientras Next refetchea.
 */
export function ClientesSearchBox({ defaultValue }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sync si el usuario navega con back/forward y el server param cambia.
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onChange = (next: string) => {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const trimmed = next.trim();
      const url = trimmed
        ? `/admin/clientes?q=${encodeURIComponent(trimmed)}`
        : "/admin/clientes";
      startTransition(() => {
        router.replace(url);
      });
    }, 300);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="clientes-q" className="sr-only">
        {COPY.admin.clientes.buscarLabel}
      </Label>
      <Input
        id="clientes-q"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder={COPY.admin.clientes.buscarPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
