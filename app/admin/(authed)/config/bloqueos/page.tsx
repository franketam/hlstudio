import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { barberos } from "@/db/schema";
import { COPY } from "@/lib/constants";
import { listBloqueosVigentes } from "@/server/queries/admin-config";
import { formatBloqueoRango } from "@/lib/format";
import { BloqueosClient } from "./BloqueosClient";
import { DeleteBloqueoButton } from "./DeleteBloqueoButton";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Bloqueos de agenda",
};

export const dynamic = "force-dynamic";

export default async function AdminBloqueosPage() {
  const [bloqueos, barberosActivos] = await Promise.all([
    listBloqueosVigentes(),
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
          {COPY.admin.bloqueos.eyebrow}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {COPY.admin.bloqueos.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.admin.bloqueos.subtitle}
        </p>
      </div>

      <BloqueosClient barberos={barberosActivos} />

      {bloqueos.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.bloqueos.vacio}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {bloqueos.map((bl) => {
            const alcance = bl.barberoNombre
              ? bl.barberoNombre
              : COPY.admin.bloqueos.alcanceTodoElLocal;
            const todoElLocal = bl.barberoId === null;
            return (
              <li
                key={bl.id}
                className="rounded-md border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]",
                          todoElLocal
                            ? "border-foreground text-foreground"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {alcance}
                      </span>
                      <span className="numeral text-sm font-medium">
                        {formatBloqueoRango(bl.desdeTs, bl.hastaTs)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "text-xs",
                        bl.motivo
                          ? "text-muted-foreground"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {bl.motivo ?? COPY.admin.bloqueos.motivoVacio}
                    </p>
                  </div>
                  <DeleteBloqueoButton id={bl.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
