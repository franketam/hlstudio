import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bloqueosAcceso } from "@/db/schema";
import { BloqueosAccesoClient } from "./BloqueosAccesoClient";

export const metadata = {
  title: "Bloqueos",
};

export const dynamic = "force-dynamic";

export default async function BloqueosAccesoPage() {
  const bloqueos = await db
    .select({
      id: bloqueosAcceso.id,
      tipo: bloqueosAcceso.tipo,
      valor: bloqueosAcceso.valor,
      motivo: bloqueosAcceso.motivo,
      createdAt: bloqueosAcceso.createdAt,
    })
    .from(bloqueosAcceso)
    .where(eq(bloqueosAcceso.activo, true))
    .orderBy(desc(bloqueosAcceso.createdAt));

  return (
    <div className="container py-8">
      <div className="mb-4">
        <Link
          href="/admin/config"
          className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← Volver a configuración
        </Link>
      </div>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Configuración
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">Bloqueos</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Teléfonos, emails e IPs que no pueden reservar por la web. Vos les
          seguís pudiendo cargar turnos a mano desde la agenda: el bloqueo es
          contra el formulario, no contra la persona. Al que intenta reservar no
          se le dice que está bloqueado, solo que no se pudo.
        </p>
      </header>

      <BloqueosAccesoClient bloqueos={bloqueos} />
    </div>
  );
}
