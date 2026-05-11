import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/app/admin/actions";
import { COPY } from "@/lib/constants";
import { AdminNav } from "@/components/admin/AdminNav";

/**
 * Guard del panel admin. Cualquier ruta que cuelgue de /admin/(authed)/...
 * exige sesión válida; si no, redirige a /admin/login.
 */
export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/60 bg-background">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link
            href="/admin"
            aria-label="Panel HLstudio"
            className="flex shrink-0 items-center"
          >
            <Logo width={120} className="h-10 w-auto" />
          </Link>
          <div className="hidden flex-1 sm:flex">
            <AdminNav />
          </div>
          <form action={logoutAction} className="shrink-0">
            <Button type="submit" variant="ghost" size="sm">
              {COPY.cta.salir}
            </Button>
          </form>
        </div>
        <div className="border-t border-border/60 sm:hidden">
          <div className="container flex h-12 items-center overflow-x-auto">
            <AdminNav />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
