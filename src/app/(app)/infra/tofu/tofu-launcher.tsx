"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runTofu } from "@/lib/actions/infra";

export function TofuLauncher({ stacks, canApply }: { stacks: string[]; canApply: boolean }) {
  const router = useRouter();
  const [stack, setStack] = useState(stacks[0] ?? "");
  const [confirmApply, setConfirmApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const launch = (action: "plan" | "apply") => {
    setError(null);
    setConfirmApply(false);
    startTransition(async () => {
      const res = await runTofu(stack, action);
      if (res.error) setError(res.error);
      else if (res.runId) router.push(`/infra/tofu/runs/${res.runId}`);
    });
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select className="tdp-input !w-56" value={stack} onChange={(e) => setStack(e.target.value)}>
        {stacks.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button className="btn-outline" disabled={pending || !stack} onClick={() => launch("plan")}>
        tofu plan
      </button>
      {canApply && !confirmApply && (
        <button className="btn-primary" disabled={pending || !stack} onClick={() => setConfirmApply(true)}>
          tofu apply
        </button>
      )}
      {canApply && confirmApply && (
        <span className="inline-flex items-center gap-2">
          <span className="text-warning text-sm font-bold">¿Aplicar cambios reales sobre “{stack}”?</span>
          <button className="btn-danger !py-1.5" disabled={pending} onClick={() => launch("apply")}>
            Sí, aplicar
          </button>
          <button className="btn-dark !py-1.5" onClick={() => setConfirmApply(false)}>
            Cancelar
          </button>
        </span>
      )}
      {pending && <span className="text-muted text-sm">Lanzando…</span>}
      {error && <span className="text-danger text-sm font-semibold">{error}</span>}
    </div>
  );
}
