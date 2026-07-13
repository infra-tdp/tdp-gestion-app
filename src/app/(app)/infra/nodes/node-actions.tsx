"use client";

import { useState, useTransition } from "react";
import { nodeAction } from "@/lib/actions/infra";

export function NodeActions({ uuid, state }: { uuid: string; state: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"stop" | "restart" | null>(null);

  const run = (action: "start" | "stop" | "restart") => {
    setError(null);
    startTransition(async () => {
      const res = await nodeAction(uuid, action);
      if (res.error) setError(res.error);
      setConfirm(null);
    });
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex gap-1.5">
        {state === "stopped" && (
          <button className="btn-outline !py-1 !px-2.5 text-[12px]" disabled={pending} onClick={() => run("start")}>
            Encender
          </button>
        )}
        {state === "started" && confirm === null && (
          <>
            <button className="btn-dark !py-1 !px-2.5 text-[12px]" disabled={pending} onClick={() => setConfirm("restart")}>
              Reiniciar
            </button>
            <button className="btn-danger !py-1 !px-2.5 text-[12px]" disabled={pending} onClick={() => setConfirm("stop")}>
              Apagar
            </button>
          </>
        )}
        {confirm !== null && (
          <>
            <span className="text-warning text-[12px] font-bold self-center">
              ¿{confirm === "stop" ? "Apagar" : "Reiniciar"} el nodo?
            </span>
            <button className="btn-danger !py-1 !px-2.5 text-[12px]" disabled={pending} onClick={() => run(confirm)}>
              Sí
            </button>
            <button className="btn-dark !py-1 !px-2.5 text-[12px]" onClick={() => setConfirm(null)}>
              No
            </button>
          </>
        )}
      </div>
      {error && <span className="text-danger text-[11px] max-w-60 text-right">{error}</span>}
    </div>
  );
}
