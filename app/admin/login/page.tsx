import { redirect } from "next/navigation";
import { LoginForm } from "@/app/admin/login/LoginForm";
import { Logo } from "@/components/brand/Logo";
import { getSession } from "@/lib/session";
import { COPY } from "@/lib/constants";

export const metadata = {
  title: "Iniciar sesión",
};

export default async function LoginPage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-bone">
          <Logo variant="light" width={120} />
          <h1 className="mt-6 font-display text-2xl">
            {COPY.admin.loginTitle}
          </h1>
          <p className="mt-1 text-sm text-bone/60">
            {COPY.admin.loginSubtitle}
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
