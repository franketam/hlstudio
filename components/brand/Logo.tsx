import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** "dark": logo negro sobre fondos claros. "light": logo blanco sobre fondos oscuros. */
  variant?: "dark" | "light";
  /** Ancho en px. Mantiene aspect ratio. */
  width?: number;
  /** Si querés override de className. */
  className?: string;
  priority?: boolean;
};

/**
 * Logo de HLstudio. Sirve dos variantes según el fondo.
 * Los archivos viven en /public — `logo.png` para fondos claros,
 * `logo-white.png` para oscuros.
 */
export function Logo({
  variant = "dark",
  width = 160,
  className,
  priority,
}: LogoProps) {
  const src = variant === "light" ? "/logo-white.png" : "/logo.png";
  const height = Math.round(width); // aspecto cuadrado aproximado; ajustá si el asset cambia
  return (
    <Image
      src={src}
      alt="HLstudio"
      width={width}
      height={height}
      priority={priority}
      className={cn("select-none", className)}
    />
  );
}
