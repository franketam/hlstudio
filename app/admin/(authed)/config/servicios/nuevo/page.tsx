import Link from "next/link";
import { COPY } from "@/lib/constants";
import { ServicioForm } from "../ServicioForm";

export const metadata = {
  title: "Nuevo servicio",
};

export default function NuevoServicioPage() {
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
        {COPY.admin.servicios.form.tituloNuevo}
      </h1>
      <div className="mt-6">
        <ServicioForm mode="create" />
      </div>
    </div>
  );
}
