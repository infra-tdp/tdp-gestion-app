"use client";

import { useActionState } from "react";
import {
  resendCodeAction,
  verify2faAction,
  type VerifyState,
} from "@/lib/auth/actions";

export function VerifyForm({ method }: { method: "EMAIL" | "TOTP" }) {
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(verify2faAction, {});
  const [resendState, resendAction, resending] = useActionState<VerifyState, FormData>(
    resendCodeAction,
    {},
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div>
          <label
            className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5"
            htmlFor="code"
          >
            Clave de 6 dígitos
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
            className="tdp-input text-center text-2xl tracking-[0.5em]"
            placeholder="······"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remember" />
          Recordar este dispositivo 7 días
        </label>
        {state.error && <p className="text-danger text-sm font-semibold">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full justify-center uppercase">
          {pending ? "Verificando…" : "Verificar"}
        </button>
      </form>

      {method === "EMAIL" && (
        <form action={resendAction} className="text-center">
          <button type="submit" disabled={resending} className="text-muted text-[12px] underline">
            {resending ? "Reenviando…" : "¿No te llegó? Reenviar clave"}
          </button>
          {resendState.error && (
            <p className="text-danger text-[12px] font-semibold mt-1">{resendState.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
