"use client";

import { useEffect } from "react";

/**
 * Error boundary de las páginas de la app. El caso más común es el "stale
 * deploy": tras un redeploy, una pestaña vieja invoca un Server Action / chunk
 * con un ID que el servidor nuevo ya no conoce (UnrecognizedActionError /
 * ChunkLoadError). No es un bug: basta recargar para tomar la versión nueva.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  const stale =
    /server action|find-server-action|not found on the server|chunkloaderror|loading chunk|dynamically imported module/i.test(
      msg,
    );

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="tdp-card p-8 max-w-lg text-center">
        <div className="headline text-3xl text-primary mb-2">
          {stale ? "La app se ha actualizado" : "Algo ha ido mal"}
        </div>
        <p className="text-muted text-sm mb-6">
          {stale
            ? "Se ha desplegado una versión nueva mientras tenías la página abierta. Recarga para continuar."
            : "Ha ocurrido un error inesperado. Puedes reintentar o recargar la página."}
        </p>
        <div className="flex gap-3 justify-center">
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Recargar
          </button>
          {!stale && (
            <button className="btn-dark" onClick={() => reset()}>
              Reintentar
            </button>
          )}
        </div>
        {error?.digest && <div className="text-muted text-[11px] mt-4">ref: {error.digest}</div>}
      </div>
    </div>
  );
}
