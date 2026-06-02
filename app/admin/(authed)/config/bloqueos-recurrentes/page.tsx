import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { barberos } from "@/db/schema";
import { COPY } from "@/lib/constants";
import { listBloqueosRecurrentes } from "@/server/queries/admin-config";
import { cn } from "@/lib/utils";
import { BloqueosRecurrentesClient } from "./BloqueosRecurrentesClient";
import { DeleteBloqueoRecurrenteButton } from "./DeleteBloqueoRecurrenteButton";
import { ToggleBloqueoRecurrenteButton } from "./ToggleBloqueoRecurrenteButton";

export const metadata = {
  title: "Bloqueos recurrentes",
};

export const dynamic = "force-dynamic";

/** "00:00" + "23:59" → etiqueta "día completo". */
function esDiaCompleto(desde: string, hasta: string): boolean {
  return desde === "00:00" && hasta === "23:59";
}

export default async function AdminBloqueosRecurrentesPage() {
  const [bloqueos, barberosActivos] = await Promise.all([
    listBloqueosRecurrentes(),
    db
      .select({ id: barberos.id, nombre: barberos.nombre })
      .from(barberos)
      .where(eq(barberos.activo, true))
      .orderBy(asc(barberos.orden), asc(barberos.nombre)),
  ]);

  return (
    <div className="container py-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {COPY.admin.bloqueosRecurrentes.eyebrow}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {COPY.admin.bloqueosRecurrentes.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.admin.bloqueosRecurrentes.subtitle}
        </p>
      </div>

      <BloqueosRecurrentesClient barberos={barberosActivos} />

      {bloqueos.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.bloqueosRecurrentes.vacio}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {bloqueos.map((bl) => {
            const diaNombre =
              COPY.admin.bloqueosRecurrentes.diasSemana[bl.diaSemana] ??
              `Día ${bl.diaSemana}`;
            const completo = esDiaCompleto(bl.desdeHora, bl.hastaHora);
            const franja = completo
              ? COPY.admin.bloqueosRecurrentes.diaCompletoLabel
              : `${bl.desdeHora} – ${bl.hastaHora}`;
            return (
              <li
                key={bl.id}
                className={cn(
                  "rounded-md border border-border bg-card p-4",
                  !bl.activo && "opacity-60"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-sm border border-foreground px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-foreground">
                        {bl.barberoNombre ?? "—"}
                      </span>
                      <span className="text-sm font-medium">{diaNombre}</span>
                      <span className="numeral text-sm text-muted-foreground">
                        {franja}
                      </span>
                      {!bl.activo ? (
                        <span className="inline-flex items-center rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {COPY.admin.bloqueosRecurrentes.inactivo}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "text-xs",
                        bl.motivo
                          ? "text-muted-foreground"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {bl.motivo ?? COPY.admin.bloqueosRecurrentes.motivoVacio}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <ToggleBloqueoRecurrenteButton
                      id={bl.id}
                      activo={bl.activo}
                    />
                    <DeleteBloqueoRecurrenteButton id={bl.id} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
