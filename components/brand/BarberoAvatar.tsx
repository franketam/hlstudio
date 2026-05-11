import { cn } from "@/lib/utils";

type BarberoAvatarProps = {
  nombre: string;
  fotoUrl?: string | null;
  size?: number;
  className?: string;
  /** "dark": gradiente oscuro (default, para fondos claros). "light": gradiente claro (para fondos oscuros). */
  tone?: "dark" | "light";
};

/**
 * Avatar del barbero. Si hay foto, la usa; si no, placeholder con iniciales
 * sobre gradiente B&N. Las fotos reales las pasa el cliente, mientras tanto
 * los placeholders evitan layout-shift.
 */
export function BarberoAvatar({
  nombre,
  fotoUrl,
  size = 96,
  className,
  tone = "dark",
}: BarberoAvatarProps) {
  const iniciales = getIniciales(nombre);
  const dim = `${size}px`;

  if (fotoUrl) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-muted",
          className
        )}
        style={{ width: dim, height: dim }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotoUrl}
          alt={nombre}
          className="h-full w-full object-cover grayscale"
        />
      </div>
    );
  }

  const isLight = tone === "light";
  const gradient = isLight
    ? "linear-gradient(135deg, #F2F2F2 0%, #E2E2E2 50%, #F2F2F2 100%)"
    : "linear-gradient(135deg, #0A0A0A 0%, #2A2A2A 50%, #0A0A0A 100%)";

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full",
        isLight ? "text-foreground" : "text-white",
        className
      )}
      style={{
        width: dim,
        height: dim,
        background: gradient,
        fontSize: Math.max(14, Math.round(size * 0.34)),
      }}
      aria-label={nombre}
    >
      <span className="font-display font-light tracking-[0.04em]">{iniciales}</span>
    </div>
  );
}

function getIniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const first = parts[0]!;
    return first.slice(0, 2).toUpperCase();
  }
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return (first[0]! + last[0]!).toUpperCase();
}
