import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/constants";

export const metadata = {
  title: "Configuración",
};

export default function AdminConfigHomePage() {
  return (
    <div className="container py-8">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {COPY.admin.config.eyebrow}
        </p>
        <h1 className="display-tight mt-1 text-3xl sm:text-4xl">
          {COPY.admin.config.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.admin.config.subtitle}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{COPY.admin.config.cards.servicios.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {COPY.admin.config.cards.servicios.desc}
            </p>
            <Button asChild size="sm">
              <Link href="/admin/config/servicios">
                {COPY.admin.config.cards.servicios.cta}
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{COPY.admin.config.cards.barberos.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {COPY.admin.config.cards.barberos.desc}
            </p>
            <Button asChild size="sm">
              <Link href="/admin/config/barberos">
                {COPY.admin.config.cards.barberos.cta}
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{COPY.admin.config.cards.precios.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {COPY.admin.config.cards.precios.desc}
            </p>
            <Button asChild size="sm">
              <Link href="/admin/config/precios">
                {COPY.admin.config.cards.precios.cta}
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{COPY.admin.config.cards.horarios.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {COPY.admin.config.cards.horarios.desc}
            </p>
            <Button asChild size="sm">
              <Link href="/admin/config/horarios">
                {COPY.admin.config.cards.horarios.cta}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
