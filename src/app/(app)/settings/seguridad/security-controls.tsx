"use client";

import { useActionState, useState, useTransition } from "react";
import {
  beginTotpSetup,
  confirmTotpSetup,
  revokeTrustedDeviceAction,
  unlinkGoogle,
  switchToEmailTwoFactor,
  type SecurityState,
  type TotpSetup,
} from "@/lib/actions/security";

/* --------------------------------- Google ---------------------------------- */

export function GoogleControls({ linked, enabled }: { linked: boolean; enabled: boolean }) {
  const [state, setState] = useState<SecurityState>({});
  const [pending, startTransition] = useTransition();

  if (!enabled) {
    return (
      <p className="text-muted text-sm">
        El acceso con Google no está configurado en el servidor (GOOGLE_CLIENT_ID /
        GOOGLE_CLIENT_SECRET).
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {linked ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold">✓ Vinculado — puedes entrar con Google</span>
          <button
            className="btn-outline !py-1 !px-2.5 text-[12px]"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setState(await unlinkGoogle());
              })
            }
          >
            Desvincular
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted text-sm">
            Vincula tu cuenta de Google (con este mismo correo) y podrás iniciar sesión con un
            clic desde la pantalla de acceso.
          </p>
          <a href="/api/auth/google/start?mode=link" className="btn-primary inline-flex">
            Vincular mi cuenta de Google
          </a>
        </div>
      )}
      {state.error && <p className="text-danger text-sm font-semibold">{state.error}</p>}
      {state.ok && <p className="text-sm font-semibold">{state.ok}</p>}
    </div>
  );
}

/* ----------------------------------- 2FA ----------------------------------- */

export function TwoFactorControls({ method }: { method: "EMAIL" | "TOTP" }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState<SecurityState, FormData>(
    confirmTotpSetup,
    {},
  );

  const startSetup = () =>
    startTransition(async () => {
      const res = await beginTotpSetup();
      if ("error" in res) setError(res.error);
      else {
        setError(null);
        setSetup(res);
      }
    });

  const backToEmail = () =>
    startTransition(async () => {
      const res = await switchToEmailTwoFactor();
      setError(res.error ?? null);
      setSetup(null);
    });

  // Confirmación correcta: el servidor ya cambió el método (revalidate) — ocultar el QR
  if (confirmState.ok && setup) setSetup(null);

  return (
    <div className="space-y-3">
      {method === "EMAIL" && !setup && (
        <>
          <p className="text-sm">
            Método actual: <b>clave temporal a tu correo</b> en cada inicio de sesión.
          </p>
          <button className="btn-outline" disabled={pending} onClick={startSetup}>
            {pending ? "Generando…" : "Cambiar a Google Authenticator"}
          </button>
        </>
      )}

      {method === "EMAIL" && setup && (
        <div className="space-y-3">
          <p className="text-sm">
            1. Escanea este QR con Google Authenticator (o una app compatible).
            <br />
            2. Introduce el código de 6 dígitos que te muestre para confirmar.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrDataUrl} alt="QR para Google Authenticator" width={220} height={220} />
          <p className="text-muted text-[12px] break-all">
            Clave manual (si no puedes escanear): <code>{setup.secret}</code>
          </p>
          <form action={confirmAction} className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                Código de la app
              </label>
              <input
                name="code"
                inputMode="numeric"
                maxLength={6}
                required
                className="tdp-input !w-36 text-center tracking-[0.3em]"
                placeholder="······"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={confirming}>
              {confirming ? "Comprobando…" : "Activar"}
            </button>
            <button type="button" className="btn-outline" onClick={() => setSetup(null)}>
              Cancelar
            </button>
          </form>
          {confirmState.error && (
            <p className="text-danger text-sm font-semibold">{confirmState.error}</p>
          )}
        </div>
      )}

      {method === "TOTP" && (
        <>
          <p className="text-sm">
            Método actual: <b>Google Authenticator</b> (código de tu app en cada inicio de sesión).
          </p>
          <button className="btn-outline" disabled={pending} onClick={backToEmail}>
            Volver a la clave temporal por correo
          </button>
        </>
      )}

      {confirmState.ok && <p className="text-sm font-semibold">{confirmState.ok}</p>}
      {error && <p className="text-danger text-sm font-semibold">{error}</p>}
    </div>
  );
}

/* ------------------------- Dispositivos de confianza ----------------------- */

export function RevokeDeviceButton({ deviceId }: { deviceId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn-danger !py-1 !px-2.5 text-[12px]"
      disabled={pending}
      onClick={() => startTransition(() => revokeTrustedDeviceAction(deviceId))}
    >
      {pending ? "Revocando…" : "Revocar"}
    </button>
  );
}
