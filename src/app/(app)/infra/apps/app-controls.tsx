"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { applyRouting, createApp, deleteApp, toggleApp, updateApp } from "@/lib/actions/apps";

export function AppForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex items-end gap-3 flex-wrap"
      action={(fd) =>
        startTransition(async () => {
          const res = await createApp(fd);
          if (res.error) setError(res.error);
          else {
            setError(null);
            formRef.current?.reset();
          }
        })
      }
    >
      <Field label="Slug" name="slug" placeholder="gestion" required className="w-32" />
      <Field label="Nombre" name="name" placeholder="TDP Gestión" required className="flex-1 min-w-40" />
      <Field label="Host (dominio)" name="host" placeholder="gestion.tallerdelpatinete.es" required className="flex-[2] min-w-56" />
      <Field label="Nodos" name="nodes" placeholder="1  o  1,2" required className="w-28" />
      <div className="w-24">
        <Label>Puerto</Label>
        <input name="port" type="number" min={1} max={65535} defaultValue={3000} className="tdp-input" />
      </div>
      <Field label="Health path" name="healthPath" placeholder="/api/health" className="w-36" />
      <Field label="Repo (opcional)" name="repo" placeholder="github.com/infra-tdp/…" className="flex-1 min-w-48" />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Registrar"}
      </button>
      {error && <span className="text-danger text-sm font-semibold w-full">{error}</span>}
    </form>
  );
}

export function AppRowActions({
  id,
  enabled,
  host,
  port,
  healthPath,
  nodes,
}: {
  id: number;
  enabled: boolean;
  host: string;
  port: number;
  healthPath: string;
  nodes: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="inline-flex flex-col items-end gap-1.5">
      <div className="inline-flex gap-1.5">
        <button className="btn-dark !py-1 !px-2.5 text-[12px]" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cerrar" : "Editar"}
        </button>
        <button
          className="btn-dark !py-1 !px-2.5 text-[12px]"
          disabled={pending}
          onClick={() => startTransition(() => toggleApp(id, !enabled))}
        >
          {enabled ? "Pausar" : "Activar"}
        </button>
        {!confirm ? (
          <button className="btn-danger !py-1 !px-2.5 text-[12px]" onClick={() => setConfirm(true)}>
            Borrar
          </button>
        ) : (
          <>
            <button
              className="btn-danger !py-1 !px-2.5 text-[12px]"
              disabled={pending}
              onClick={() => startTransition(() => deleteApp(id))}
            >
              Confirmar
            </button>
            <button className="btn-dark !py-1 !px-2.5 text-[12px]" onClick={() => setConfirm(false)}>
              No
            </button>
          </>
        )}
      </div>
      {editing && (
        <form
          ref={formRef}
          className="flex items-end gap-2 flex-wrap justify-end mt-1"
          action={(fd) =>
            startTransition(async () => {
              const res = await updateApp(id, fd);
              if (res.error) setError(res.error);
              else {
                setError(null);
                setEditing(false);
              }
            })
          }
        >
          <input name="host" defaultValue={host} className="tdp-input !py-1 w-56 text-[13px]" />
          <input name="nodes" defaultValue={nodes} className="tdp-input !py-1 w-24 text-[13px]" placeholder="nodos" />
          <input name="port" type="number" defaultValue={port} className="tdp-input !py-1 w-20 text-[13px]" />
          <input name="healthPath" defaultValue={healthPath} className="tdp-input !py-1 w-32 text-[13px]" />
          <button type="submit" className="btn-primary !py-1 !px-2.5 text-[12px]" disabled={pending}>
            Guardar
          </button>
          {error && <span className="text-danger text-[12px] font-semibold w-full text-right">{error}</span>}
        </form>
      )}
    </div>
  );
}

/** Renderiza el registro a tfvars y lanza plan/apply del enrutado del LB. */
export function RoutingActions({ canApply }: { canApply: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ runId?: number; error?: string } | null>(null);

  const run = (action: "plan" | "apply") =>
    startTransition(async () => {
      setMsg(null);
      setMsg(await applyRouting(action));
    });

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <button className="btn-dark !py-1.5 !px-3 text-[13px]" disabled={pending} onClick={() => run("plan")}>
        {pending ? "…" : "Plan enrutado"}
      </button>
      {canApply && (
        <button className="btn-primary !py-1.5 !px-3 text-[13px]" disabled={pending} onClick={() => run("apply")}>
          Aplicar enrutado
        </button>
      )}
      {msg?.runId && (
        <Link href={`/infra/tofu/runs/${msg.runId}`} className="text-primary text-[13px] font-semibold underline">
          Ver run #{msg.runId} →
        </Link>
      )}
      {msg?.error && <span className="text-danger text-[13px] font-semibold">{msg.error}</span>}
    </div>
  );
}

/* ------------------------------- helpers ---------------------------------- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">{children}</label>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
  className = "",
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <input name={name} className="tdp-input" placeholder={placeholder} required={required} />
    </div>
  );
}
