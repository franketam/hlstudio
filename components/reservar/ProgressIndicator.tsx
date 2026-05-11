import { cn } from "@/lib/utils";

type Props = {
  paso: 1 | 2 | 3 | 4;
};

const LABELS = ["Barbero", "Servicio", "Día y hora", "Tus datos"] as const;

export function ProgressIndicator({ paso }: Props) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Paso {paso} de 4
      </p>
      <div className="mt-2 flex gap-1.5">
        {LABELS.map((_, i) => {
          const idx = i + 1;
          const done = idx < paso;
          const active = idx === paso;
          return (
            <div
              key={idx}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                done && "bg-foreground",
                active && "bg-foreground",
                !done && !active && "bg-border"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
