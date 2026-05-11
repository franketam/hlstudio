import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listTurnosDelDia } from "@/server/queries/admin";
import { ymdLocal, horaCortaAR } from "@/lib/format";

export const metadata = {
  title: "Panel",
};

export const dynamic = "force-dynamic";

/**
 * Dashboard del admin. En Sprint 1 muestra un resumen del día y un link rápido
 * a la agenda. Sprint 2 agrega ficha de cliente, CRUDs y bloqueos.
 */
export default async function AdminHomePage() {
  const hoy = ymdLocal(new Date());
  const turnosHoy = await listTurnosDelDia(hoy);
  const activos = turnosHoy.filter(
    (t) =>
      t.estado !== "cancelado_cliente" && t.estado !== "cancelado_admin"
  );
  const proximo = activos.find((t) => t.inicioTs.getTime() > Date.now());

  return (
    <div className="container py-8">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Panel
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          Hola, HLstudio.
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Agenda de hoy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Activos: </span>
              <span className="numeral font-medium">{activos.length}</span>
            </p>
            {proximo ? (
              <p className="text-muted-foreground">
                Próximo: {horaCortaAR(proximo.inicioTs)} ·{" "}
                <span className="text-foreground">{proximo.clienteNombre}</span>{" "}
                con {proximo.barberoNombre}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Sin más turnos pendientes hoy.
              </p>
            )}
            <Button asChild size="sm">
              <Link href="/admin/agenda">Ver agenda</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Búsqueda + historial. Sprint 2.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Servicios y barberos. Precios y horarios próximamente.
            </p>
            <Button asChild size="sm">
              <Link href="/admin/config">Administrar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
