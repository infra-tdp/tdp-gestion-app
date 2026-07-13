"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="tdp-input" placeholder="tu@tallerdelpatinete.es" />
      </div>
      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5" htmlFor="password">
          Contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="tdp-input" placeholder="••••••••••" />
      </div>
      {state.error && <p className="text-danger text-sm font-semibold">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full justify-center uppercase">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
