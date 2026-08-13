"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Modal de alerta con una sola acción (cerrar / corregir).
 *
 * Escrito a mano en vez de sumar `@radix-ui/react-dialog`: el proyecto usa
 * componentes shadcn-style manuales y este es el único diálogo de la app, con
 * un solo botón. Un trap de foco completo sería sobreingeniería acá; alcanza
 * con mover el foco al botón al abrir, devolverlo al cerrar y escuchar Escape.
 *
 * Usa `role="alertdialog"` (no `dialog`): comunica un error que requiere acuse
 * del usuario, que es exactamente para lo que existe ese rol.
 *
 * Va por portal a `document.body` porque `position: fixed` se ancla al ancestro
 * más cercano con `transform`/`filter`, y el modal no puede depender de que
 * ningún contenedor de la página tenga o no una animación.
 */
type Props = {
  open: boolean;
  titulo: string;
  /** Línea principal. Suele venir del server e incluir el dato que falló. */
  mensaje: string;
  /** Líneas de ayuda secundarias. */
  detalles?: string[];
  textoCerrar: string;
  onClose: () => void;
  /**
   * Dónde dejar el foco al cerrar. Sin esto vuelve a quien lo tenía antes de
   * abrir (el botón de submit), que casi nunca es lo que se quiere: si el modal
   * pide corregir un campo, el foco tiene que terminar en ese campo.
   */
  enfocarAlCerrar?: () => void;
};

export function AlertModal({
  open,
  titulo,
  mensaje,
  detalles = [],
  textoCerrar,
  onClose,
  enfocarAlCerrar,
}: Props) {
  const botonRef = useRef<HTMLButtonElement>(null);
  const focoPrevioRef = useRef<HTMLElement | null>(null);
  // En un ref para que el efecto no se re-suscriba si el caller pasa una
  // función nueva en cada render.
  const enfocarAlCerrarRef = useRef(enfocarAlCerrar);
  enfocarAlCerrarRef.current = enfocarAlCerrar;

  useEffect(() => {
    if (!open) return;

    // Guardamos quién tenía el foco para poder devolvérselo: si no, al cerrar
    // el foco vuelve al <body> y quien navega por teclado pierde el lugar.
    focoPrevioRef.current = document.activeElement as HTMLElement | null;
    botonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    // Bloqueamos el scroll del fondo mientras el modal está abierto.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowPrevio;
      if (enfocarAlCerrarRef.current) enfocarAlCerrarRef.current();
      else focoPrevioRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // El backdrop cierra, pero solo si el click nació en el backdrop mismo:
      // sin el check, arrastrar una selección desde adentro del panel y soltar
      // afuera cerraría el modal.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-modal-titulo"
        aria-describedby="alert-modal-mensaje"
        className="relative w-full max-w-md rounded-md border border-border bg-card p-6 shadow-lg"
      >
        <h2
          id="alert-modal-titulo"
          className="display-tight text-xl sm:text-2xl"
        >
          {titulo}
        </h2>

        <p id="alert-modal-mensaje" className="mt-3 text-sm">
          {mensaje}
        </p>

        {detalles.map((d) => (
          <p key={d} className="mt-2 text-sm text-muted-foreground">
            {d}
          </p>
        ))}

        <Button
          ref={botonRef}
          type="button"
          className="mt-6 w-full"
          onClick={onClose}
        >
          {textoCerrar}
        </Button>
      </div>
    </div>,
    document.body
  );
}
