import Link from "next/link";
import { notFound } from "next/navigation";
import { COPY } from "@/lib/constants";
import { getBarberoByIdAdmin } from "@/server/queries/admin-config";
import { BarberoForm } from "../../BarberoForm";

export const metadata = {
  title: "Editar barbero",
};

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditarBarberoPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const barbero = await getBarberoByIdAdmin(id);
  if (!barbero) notFound();

  return (
    <div className="container max-w-xl py-8">
      <div className="mb-5">
        <Link
          href="/admin/config/barberos"
          className="text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          ← {COPY.cta.volver}
        </Link>
      </div>
      <h1 className="display-tight text-3xl sm:text-4xl">
        {COPY.admin.barberos.form.tituloEditar}
      </h1>
      <div className="mt-6">
        <BarberoForm
          mode="edit"
          barberoId={barbero.id}
          defaultValues={{
            nombre: barbero.nombre,
            fotoUrl: barbero.fotoUrl ?? "",
            descripcion: barbero.descripcion ?? "",
            email: barbero.email ?? "",
            orden: barbero.orden,
          }}
        />
      </div>
    </div>
  );
}
