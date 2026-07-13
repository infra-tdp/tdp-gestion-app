"use client";

import { useRef, useState, useTransition } from "react";
import { createUser, resetUserPassword, setUserActive, setUserRole } from "@/lib/actions/users";

const ROLES = ["ADMIN", "INFRA", "DEV", "STORE", "VIEWER"] as const;

export function UserForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex items-end gap-3 flex-wrap"
      action={(fd) =>
        startTransition(async () => {
          const res = await createUser(fd);
          if (res.error) setError(res.error);
          else {
            setError(null);
            formRef.current?.reset();
          }
        })
      }
    >
      <div className="flex-1 min-w-40">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Nombre</label>
        <input name="name" className="tdp-input" placeholder="Tienda Valencia / Ana Dev" required />
      </div>
      <div className="flex-1 min-w-52">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Email</label>
        <input name="email" type="email" className="tdp-input" placeholder="valencia@tallerdelpatinete.es" required />
      </div>
      <div className="w-44">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Contraseña</label>
        <input name="password" type="password" className="tdp-input" placeholder="mín. 10 caracteres" required />
      </div>
      <div className="w-32">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Rol</label>
        <select name="role" className="tdp-input" defaultValue="DEV">
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creando…" : "Crear"}
      </button>
      {error && <span className="text-danger text-sm font-semibold w-full">{error}</span>}
    </form>
  );
}

export function UserRowActions({ userId, role, active }: { userId: number; role: string; active: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error ?? null);
    });

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1.5">
        <select
          className="tdp-input !w-28 !py-1 text-[12px]"
          value={role}
          disabled={pending}
          onChange={(e) => act(() => setUserRole(userId, e.target.value as (typeof ROLES)[number]))}
        >
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button
          className={`${active ? "btn-danger" : "btn-outline"} !py-1 !px-2.5 text-[12px]`}
          disabled={pending}
          onClick={() => act(() => setUserActive(userId, !active))}
        >
          {active ? "Desactivar" : "Activar"}
        </button>
        <button
          className="btn-dark !py-1 !px-2.5 text-[12px]"
          disabled={pending}
          onClick={() => {
            const pwd = window.prompt("Nueva contraseña (mín. 10 caracteres):");
            if (pwd) act(() => resetUserPassword(userId, pwd));
          }}
        >
          Reset pass
        </button>
      </div>
      {error && <span className="text-danger text-[11px]">{error}</span>}
    </div>
  );
}
