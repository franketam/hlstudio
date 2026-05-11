import Link from "next/link";
import { COPY } from "@/lib/constants";
import { getMatrizPrecios } from "@/server/queries/admin-config";
import { NuevoTurnoForm } from "./NuevoTurnoForm";

export const metadata = {
  title: "Nuevo turno",
};

export const dynamic = "force-dynamic";

export default async function AdminNuevoTurnoPage() {
  // Reusamos la matriz de precios: ya viene con barberos activos, servicios
  // activos y la combinación válida barbero↔servicio↔precio. El form usa el
  // mapa de precios para filtrar servicios sin precio cargado para el barbero
  // seleccionado.
  const matriz = await getMatrizPrecios();

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-6">
        <Link
          href="/admin/agenda"
          className="text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          {COPY.admin.nuevoTurno.volverAgenda}
        </Link>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {COPY.admin.nuevoTurno.eyebrow}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {COPY.admin.nuevoTurno.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.admin.nuevoTurno.subtitle}
        </p>
      </div>

      {matriz.barberos.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.precios.sinBarberos}
          </p>
        </div>
      ) : matriz.servicios.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.precios.sinServicios}
          </p>
        </div>
      ) : (
        <NuevoTurnoForm
          barberos={matriz.barberos}
          servicios={matriz.servicios}
          precios={matriz.precios}
        />
      )}
    </div>
  );
}
