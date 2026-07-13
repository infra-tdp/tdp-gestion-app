"use client";

import { useRef, useState, useTransition } from "react";
import { addSshKey, deleteSshKey } from "@/lib/actions/users";

type Key = { id: number; name: string; publicKey: string; createdAt: string };

export function SshKeyControls({ keys }: { keys: Key[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      <form
        ref={formRef}
        className="space-y-3"
        action={(fd) =>
          startTransition(async () => {
            const res = await addSshKey(fd);
            if (res.error) setError(res.error);
            else {
              setError(null);
              formRef.current?.reset();
            }
          })
        }
      >
        <div className="flex gap-3 flex-wrap">
          <div className="w-56">
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Nombre</label>
            <input name="name" className="tdp-input" placeholder="portátil-ana" />
          </div>
          <div className="flex-1 min-w-72">
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
              Clave pública
            </label>
            <textarea
              name="publicKey"
              className="tdp-input font-mono text-[12px]"
              rows={2}
              placeholder="ssh-ed25519 AAAA… tu@email"
              required
            />
          </div>
        </div>
        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Añadir clave"}
        </button>
      </form>

      <ul className="space-y-2">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center gap-3 text-sm bg-bg-tertiary rounded-[4px] border border-border-dark px-3 py-2">
            <span className="font-semibold min-w-32">{k.name}</span>
            <code className="text-muted text-[12px] truncate flex-1">{k.publicKey}</code>
            <button
              className="btn-danger !py-1 !px-2.5 text-[12px] shrink-0"
              disabled={pending}
              onClick={() => startTransition(() => deleteSshKey(k.id))}
            >
              Borrar
            </button>
          </li>
        ))}
        {keys.length === 0 && <li className="text-muted text-sm">No tienes claves guardadas.</li>}
      </ul>
    </div>
  );
}
