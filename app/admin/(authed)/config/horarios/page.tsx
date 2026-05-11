import { COPY } from "@/lib/constants";
import { getHorariosConfig } from "@/server/queries/admin-config";
import { HorariosEditor } from "./HorariosEditor";

export const metadata = {
  title: "Horarios y descansos",
};

export const dynamic = "force-dynamic";

export default async function AdminHorariosPage() {
  const data = await getHorariosConfig();

  return (
    <div className="container py-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {COPY.admin.horarios.eyebrow}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {COPY.admin.horarios.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.admin.horarios.subtitle}
        </p>
      </div>

      <HorariosEditor initial={data} />
    </div>
  );
}
