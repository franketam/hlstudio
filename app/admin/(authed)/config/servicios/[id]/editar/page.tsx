import Link from "next/link";
import { notFound } from "next/navigation";
import { COPY } from "@/lib/constants";
import { getServicioByIdAdmin } from "@/server/queries/admin-config";
import { ServicioForm } from "../../ServicioForm";

export const metadata = {
  title: "Editar servicio",
};

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditarServicioPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const servicio = await getServicioByIdAdmin(id);
  if (!servicio) notFound();

  return (
    <div className="container max-w-xl py-8">
      <div className="mb-5">
        <Link
          href="/admin/config/servicios"
          className="text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          ← {COPY.cta.volver}
        </Link>
      </div>
      <h1 className="display-tight text-3xl sm:text-4xl">
        {COPY.admin.servicios.form.tituloEditar}
      </h1>
      <div className="mt-6">
        <ServicioForm
          mode="edit"
          servicioId={servicio.id}
          defaultValues={{
            nombre: servicio.nombre,
            duracionMin: servicio.duracionMin,
            descripcion: servicio.descripcion ?? "",
            orden: servicio.orden,
          }}
        />
      </div>
    </div>
  );
}
