import Link from "next/link";
import { ProgressIndicator } from "@/components/reservar/ProgressIndicator";
import { BarberoAvatar } from "@/components/brand/BarberoAvatar";
import { listBarberosActivos } from "@/server/queries/public";

export const metadata = {
  title: "Reservar turno",
};

export default async function ReservarPaso1Page() {
  const barberosLista = await listBarberosActivos();

  return (
    <div className="container max-w-2xl py-8">
      <ProgressIndicator paso={1} />

      <h1 className="display-tight text-3xl sm:text-4xl">
        Elegí con quién querés cortarte
      </h1>
      <p className="mt-2 text-muted-foreground">
        Cada barbero tiene su agenda. Después elegís servicio y horario.
      </p>

      {barberosLista.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          Por ahora no hay barberos activos. Probá más tarde.
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {barberosLista.map((b) => (
            <li key={b.id}>
              <Link
                href={{
                  pathname: "/reservar/servicio",
                  query: { barbero: b.id },
                }}
                className="group flex items-center gap-4 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/40 hover:bg-accent"
              >
                <BarberoAvatar
                  nombre={b.nombre}
                  fotoUrl={b.fotoUrl}
                  size={64}
                />
                <div className="min-w-0">
                  <p className="font-display text-xl">{b.nombre}</p>
                  {b.descripcion ? (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {b.descripcion}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Reservar con {b.nombre.split(" ")[0]}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
