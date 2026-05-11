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

// Aspect ratio real del asset (logo.png / logo-white.png son 1076x873).
// Hardcodeado para que Next.js reserve la altura correcta y evite CLS.
// Si cambia el asset, actualizar estos valores.
const LOGO_INTRINSIC_WIDTH = 1076;
const LOGO_INTRINSIC_HEIGHT = 873;

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
  const height = Math.round((width * LOGO_INTRINSIC_HEIGHT) / LOGO_INTRINSIC_WIDTH);
  // `sizes` evita que next/image genere/sirva una variante más grande de la
  // necesaria (sin esto, el srcset incluye `w=256` y el browser puede pedirla
  // aunque solo necesite ~88px). Mejora LCP del logo en mobile.
  const sizes = `${width * 2}px`;
  return (
    <Image
      src={src}
      alt="HLstudio"
      width={width}
      height={height}
      priority={priority}
      sizes={sizes}
      className={cn("h-auto select-none", className)}
    />
  );
}
