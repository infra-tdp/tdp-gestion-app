"use client";

import { useEffect, useRef, useState } from "react";

/** Sigue el log del run en vivo (polling ligero mientras esté en ejecución). */
export function LiveLog({ runId, initialLog, live }: { runId: number; initialLog: string; live: boolean }) {
  const [log, setLog] = useState(initialLog);
  const [status, setStatus] = useState<string | null>(live ? "running" : null);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/tofu/runs/${runId}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { log: string; status: string };
          if (!stop) {
            setLog(data.log);
            setStatus(data.status);
            if (data.status === "success" || data.status === "error") {
              window.location.reload();
              return;
            }
          }
        }
      } catch {
        /* siguiente tick */
      }
      if (!stop) setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [runId, live]);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log]);

  return (
    <pre ref={ref} className="tdp-log max-h-[65vh] overflow-y-auto">
      {log || (status ? "Esperando salida…" : "Sin salida")}
    </pre>
  );
}
