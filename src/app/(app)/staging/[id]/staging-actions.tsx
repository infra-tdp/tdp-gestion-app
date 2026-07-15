"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { destroyStaging, mergeStagingPr, openStagingPr, redeployStaging } from "@/lib/actions/staging";

export function StagingActions({
  envId,
  status,
  hasPr,
  canDestroy,
  canMerge,
  isOwner,
  live,
}: {
  envId: number;
  status: string;
  hasPr: boolean;
  canDestroy: boolean;
  canMerge: boolean;
  isOwner: boolean;
  live: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState("");
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [pending, startTransition] = useTransition();

  // Mientras el entorno provisiona/destruye, refresca la página cada 3 s
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [live, router]);

  const act = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4 text-sm">
      {status === "active" && (isOwner || canDestroy) && (
        <div>
          <button className="btn-dark" disabled={pending} onClick={() => act(() => redeployStaging(envId))}>
            Redesplegar (rebuild de la rama)
          </button>
          <p className="text-muted text-[12px] mt-1.5">
            Tras hacer <code>git push</code> en el devbox, redespliega para ver tus cambios en vivo.
          </p>
        </div>
      )}

      {status === "active" && !hasPr && (
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
            Abrir PR hacia main
          </label>
          <div className="flex gap-2">
            <input
              className="tdp-input"
              placeholder="Título de la PR (qué has cambiado)"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={pending} onClick={() => act(() => openStagingPr(envId, prTitle))}>
              Abrir PR
            </button>
          </div>
          <p className="text-muted text-[12px] mt-1.5">
            Haz push de tus commits a la rama desde el devbox antes de abrir la PR.
          </p>
        </div>
      )}

      {hasPr && (
        <div>
          {canMerge ? (
            <button className="btn-primary" disabled={pending} onClick={() => act(() => mergeStagingPr(envId))}>
              Aprobar y mergear PR
            </button>
          ) : (
            <p className="text-muted">
              {isOwner
                ? "Tu PR está abierta — la debe revisar y mergear otra persona (ADMIN/INFRA)."
                : "PR abierta — pendiente de revisión."}
            </p>
          )}
          {canMerge && (
            <p className="text-muted text-[12px] mt-1.5">Al mergear, el CI construye y publica la nueva imagen de producción.</p>
          )}
        </div>
      )}

      {canDestroy && status !== "destroyed" && status !== "destroying" && (
        <div>
          {!confirmDestroy ? (
            <button className="btn-danger" disabled={pending} onClick={() => setConfirmDestroy(true)}>
              Destruir entorno
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="text-warning font-bold">¿Destruir? Se pierden la BD temporal y los volúmenes.</span>
              <button className="btn-danger !py-1.5" disabled={pending} onClick={() => act(() => destroyStaging(envId))}>
                Sí, destruir
              </button>
              <button className="btn-dark !py-1.5" onClick={() => setConfirmDestroy(false)}>
                Cancelar
              </button>
            </span>
          )}
        </div>
      )}

      {live && <p className="text-warning font-semibold">⏳ Operación en curso — esta página se actualiza sola…</p>}
      {error && <p className="text-danger font-semibold">{error}</p>}
    </div>
  );
}
