import { COPY } from "@/lib/constants";
import { getMatrizPrecios } from "@/server/queries/admin-config";
import { MatrizPreciosEditor } from "./MatrizPreciosEditor";

export const metadata = {
  title: "Precios",
};

export const dynamic = "force-dynamic";

export default async function AdminPreciosPage() {
  const data = await getMatrizPrecios();

  return (
    <div className="container py-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {COPY.admin.precios.eyebrow}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {COPY.admin.precios.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.admin.precios.subtitle}
        </p>
      </div>

      {data.barberos.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.precios.sinBarberos}
          </p>
        </div>
      ) : data.servicios.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {COPY.admin.precios.sinServicios}
          </p>
        </div>
      ) : (
        <MatrizPreciosEditor
          barberos={data.barberos}
          servicios={data.servicios}
          precios={data.precios}
        />
      )}
    </div>
  );
}
