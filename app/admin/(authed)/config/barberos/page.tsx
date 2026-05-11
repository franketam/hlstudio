import Link from "next/link";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";
import { listBarberosAdmin } from "@/server/queries/admin-config";
import { toggleBarberoActivoFormAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Barberos",
};

export const dynamic = "force-dynamic";

export default async function AdminBarberosListPage() {
  const items = await listBarberosAdmin();

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {COPY.admin.barberos.eyebrow}
          </p>
          <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
            {COPY.admin.barberos.title}
          </h1>
        </div>
        <Button asChild>
          <Link href="/admin/config/barberos/nuevo">
            {COPY.admin.barberos.nuevo}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.barberos.vacio}
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/admin/config/barberos/nuevo">
              {COPY.admin.barberos.vacioCta}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <ul className="space-y-3 md:hidden">
            {items.map((b) => (
              <li
                key={b.id}
                className={cn(
                  "rounded-md border bg-card p-4",
                  b.activo ? "border-border" : "border-border/40 opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{b.nombre}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      orden {b.orden}
                      {b.email ? ` · ${b.email}` : " · sin email"}
                    </div>
                    {b.descripcion ? (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {b.descripcion}
                      </p>
                    ) : null}
                  </div>
                  <EstadoPill activo={b.activo} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/config/barberos/${b.id}/editar`}>
                      {COPY.cta.editar}
                    </Link>
                  </Button>
                  <form action={toggleBarberoActivoFormAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <input
                      type="hidden"
                      name="activo"
                      value={b.activo ? "false" : "true"}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant={b.activo ? "ghost" : "default"}
                    >
                      {b.activo ? COPY.cta.desactivar : COPY.cta.activar}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop */}
          <div className="hidden overflow-hidden rounded-md border border-border md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Orden</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((b) => (
                  <tr key={b.id} className={cn(!b.activo && "opacity-60")}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.nombre}</div>
                      {b.descripcion ? (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {b.descripcion}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.email ?? (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 numeral text-muted-foreground">
                      {b.orden}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoPill activo={b.activo} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/admin/config/barberos/${b.id}/editar`}
                          >
                            {COPY.cta.editar}
                          </Link>
                        </Button>
                        <form action={toggleBarberoActivoFormAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <input
                            type="hidden"
                            name="activo"
                            value={b.activo ? "false" : "true"}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            variant={b.activo ? "ghost" : "default"}
                          >
                            {b.activo
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
