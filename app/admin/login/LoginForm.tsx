"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type ActionResult } from "@/app/admin/actions";
import { COPY } from "@/lib/constants";

const initial: ActionResult | null = null;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-lg border border-bone/10 bg-ink-soft p-6 shadow-xl"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="email" className="text-bone">
          Usuario
        </Label>
        <Input
          id="email"
          name="email"
          type="text"
          autoComplete="username"
          required
          className="border-bone/15 bg-ink text-bone placeholder:text-bone/40"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-bone">
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border-bone/15 bg-ink text-bone placeholder:text-bone/40"
        />
      </div>

      {state && state.ok === false ? (
        <p
          role="alert"
          aria-live="polite"
          className="text-sm text-destructive-foreground/90"
        >
          {state.error.message}
        </p>
      ) : null}

      <Button
        type="submit"
        className="w-full bg-bone text-ink hover:bg-bone/90"
        size="lg"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Ingresando..." : COPY.cta.iniciarSesion}
      </Button>
    </form>
  );
}
