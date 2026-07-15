"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresca el server component de la ficha de staging cada `intervalMs` mientras
 * el entorno está "vivo" (aprovisionando/destruyendo), para ver el registro de
 * provisión y el estado sin recargar a mano. Se desmonta al llegar a un estado
 * final, así que deja de refrescar solo.
 */
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
      setTick((n) => n + 1);
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-1.5 text-muted text-[12px]" title={`Auto-actualizando (${tick})`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      en vivo
    </span>
  );
}
