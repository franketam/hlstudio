import Link from "next/link";
import { COPY } from "@/lib/constants";
import { BarberoForm } from "../BarberoForm";

export const metadata = {
  title: "Nuevo barbero",
};

export default function NuevoBarberoPage() {
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
        {COPY.admin.barberos.form.tituloNuevo}
      </h1>
      <div className="mt-6">
        <BarberoForm mode="create" />
      </div>
    </div>
  );
}
