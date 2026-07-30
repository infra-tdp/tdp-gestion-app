"use client";

import { useActionState } from "react";
import {
  saveMailSettingsAction,
  sendTestMailAction,
  type MailFormState,
} from "@/lib/actions/mail";

/** Ajustes SMTP sin la contraseña (nunca viaja al cliente). */
export type MailFormValues = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPass: boolean;
  fromName: string;
  fromEmail: string;
  notifyByEmail: boolean;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

export function MailSettingsForm({ initial }: { initial: MailFormValues | null }) {
  const [state, formAction, pending] = useActionState<MailFormState, FormData>(
    saveMailSettingsAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Host SMTP">
          <input name="host" className="tdp-input" placeholder="smtp.tallerdelpatinete.es" defaultValue={initial?.host} required />
        </Field>
        <Field label="Puerto">
          <input name="port" type="number" min={1} max={65535} className="tdp-input" defaultValue={initial?.port ?? 587} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Usuario">
          <input name="user" className="tdp-input" autoComplete="off" placeholder="notificaciones@tallerdelpatinete.es" defaultValue={initial?.user} />
        </Field>
        <Field label="Contraseña">
          <input
            name="pass"
            type="password"
            className="tdp-input"
            autoComplete="new-password"
            placeholder={initial?.hasPass ? "•••••••• (guardada — vacío = no cambiar)" : "contraseña SMTP"}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre remitente">
          <input name="fromName" className="tdp-input" placeholder="TDP Gestión" defaultValue={initial?.fromName ?? "TDP Gestión"} />
        </Field>
        <Field label="Email remitente">
          <input name="fromEmail" type="email" className="tdp-input" placeholder="notificaciones@tallerdelpatinete.es" defaultValue={initial?.fromEmail} required />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="secure" defaultChecked={initial?.secure ?? false} />
        TLS implícito (puerto 465) — desmarcado usa STARTTLS si el servidor lo ofrece
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyByEmail" defaultChecked={initial?.notifyByEmail ?? false} />
        Enviar por email las notificaciones del sistema a cada usuario
      </label>
      {state.error && <p className="text-danger text-sm font-semibold">{state.error}</p>}
      {state.ok && <p className="text-sm font-semibold">{state.ok}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar configuración"}
      </button>
    </form>
  );
}

export function TestMailButton({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState<MailFormState, FormData>(
    sendTestMailAction,
    {},
  );
  return (
    <form action={formAction} className="flex items-center gap-3 flex-wrap">
      <button type="submit" className="btn-outline" disabled={disabled || pending}>
        {pending ? "Enviando…" : "Enviarme un correo de prueba"}
      </button>
      {disabled && <span className="text-muted text-[12px]">Guarda primero la configuración.</span>}
      {state.error && <span className="text-danger text-sm font-semibold">{state.error}</span>}
      {state.ok && <span className="text-sm font-semibold">{state.ok}</span>}
    </form>
  );
}
