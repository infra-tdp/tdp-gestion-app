"use client";

import { useRef, useState, useTransition } from "react";
import { createMonitor, deleteMonitor, toggleMonitor } from "@/lib/actions/infra";

export function MonitorForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex items-end gap-3 flex-wrap"
      action={(fd) =>
        startTransition(async () => {
          const res = await createMonitor(fd);
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
        <input name="name" className="tdp-input" placeholder="Web producción" required />
      </div>
      <div className="flex-[2] min-w-64">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">URL</label>
        <input name="url" type="url" className="tdp-input" placeholder="https://tallerdelpatinete.es" required />
      </div>
      <div className="w-28">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Intervalo (s)</label>
        <input name="interval" type="number" min={15} defaultValue={60} className="tdp-input" />
      </div>
      <div className="w-28">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">HTTP esperado</label>
        <input name="expectedStatus" type="number" defaultValue={200} className="tdp-input" />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Añadiendo…" : "Añadir"}
      </button>
      {error && <span className="text-danger text-sm font-semibold w-full">{error}</span>}
    </form>
  );
}

export function MonitorRowActions({ id, enabled }: { id: number; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="inline-flex gap-1.5">
      <button
        className="btn-dark !py-1 !px-2.5 text-[12px]"
        disabled={pending}
        onClick={() => startTransition(() => toggleMonitor(id, !enabled))}
      >
        {enabled ? "Pausar" : "Reanudar"}
      </button>
      {!confirm ? (
        <button className="btn-danger !py-1 !px-2.5 text-[12px]" disabled={pending} onClick={() => setConfirm(true)}>
          Borrar
        </button>
      ) : (
        <>
          <button
            className="btn-danger !py-1 !px-2.5 text-[12px]"
            disabled={pending}
            onClick={() => startTransition(() => deleteMonitor(id))}
          >
            Confirmar
          </button>
          <button className="btn-dark !py-1 !px-2.5 text-[12px]" onClick={() => setConfirm(false)}>
            No
          </button>
        </>
      )}
    </div>
  );
}
