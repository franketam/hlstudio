import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export default function TurnoNotFound() {
  return (
    <div className="container max-w-md py-16 text-center">
      <Logo width={96} className="mx-auto" />
      <h1 className="display-tight mt-8 text-3xl">Link inválido</h1>
      <p className="mt-2 text-muted-foreground">
        Este link no corresponde a ningún turno o expiró.
      </p>
      <Button asChild className="mt-8">
        <Link href="/reservar">Reservar un turno</Link>
      </Button>
    </div>
  );
}
