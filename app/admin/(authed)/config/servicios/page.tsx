import Link from "next/link";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import { listServiciosAdmin } from "@/server/queries/admin-config";
import { formatDuracion } from "@/lib/format";
import { toggleServicioActivoFormAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Servicios",
};

export const dynamic = "force-dynamic";

export default async function AdminServiciosListPage() {
  const items = await listServiciosAdmin();

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {COPY.admin.servicios.eyebrow}
          </p>
          <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
            {COPY.admin.servicios.title}
          </h1>
        </div>
        <Button asChild>
          <Link href="/admin/config/servicios/nuevo">
            {COPY.admin.servicios.nuevo}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.servicios.vacio}
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/admin/config/servicios/nuevo">
              {COPY.admin.servicios.vacioCta}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile: cards apiladas */}
          <ul className="space-y-3 md:hidden">
            {items.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "rounded-md border bg-card p-4",
                  s.activo ? "border-border" : "border-border/40 opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{s.nombre}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDuracion(s.duracionMin)} · orden {s.orden}
                    </div>
                    {s.descripcion ? (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {s.descripcion}
                      </p>
                    ) : null}
                  </div>
                  <EstadoPill activo={s.activo} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/config/servicios/${s.id}/editar`}>
                      {COPY.cta.editar}
                    </Link>
                  </Button>
                  <form action={toggleServicioActivoFormAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      type="hidden"
                      name="activo"
                      value={s.activo ? "false" : "true"}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant={s.activo ? "ghost" : "default"}
                    >
                      {s.activo ? COPY.cta.desactivar : COPY.cta.activar}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabla */}
          <div className="hidden overflow-hidden rounded-md border border-border md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Duración</th>
                  <th className="px-4 py-3 font-medium">Orden</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((s) => (
                  <tr
                    key={s.id}
                    className={cn(!s.activo && "opacity-60")}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.nombre}</div>
                      {s.descripcion ? (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {s.descripcion}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDuracion(s.duracionMin)}
                    </td>
                    <td className="px-4 py-3 numeral text-muted-foreground">
                      {s.orden}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoPill activo={s.activo} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/admin/config/servicios/${s.id}/editar`}
                          >
                            {COPY.cta.editar}
                          </Link>
                        </Button>
                        <form action={toggleServicioActivoFormAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <input
                            type="hidden"
                            name="activo"
                            value={s.activo ? "false" : "true"}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            variant={s.activo ? "ghost" : "default"}
                          >
                            {s.activo
                              ? COPY.cta.desactivar
                              : COPY.cta.activar}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function EstadoPill({ activo }: { activo: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]",
        activo
          ? "border-border text-foreground"
          : "border-border/40 text-muted-foreground"
      )}
    >
      {activo ? COPY.admin.estados.activo : COPY.admin.estados.inactivo}
    </span>
  );
}
