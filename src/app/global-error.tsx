"use client";

/**
 * Error boundary raíz (reemplaza al layout, por eso lleva html/body y estilos
 * inline: globals.css puede no aplicarse aquí). Cubre errores que escapan al
 * boundary de (app) — incluido el "stale deploy" tras un redeploy.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  const stale =
    /server action|find-server-action|not found on the server|chunkloaderror|loading chunk|dynamically imported module/i.test(
      msg,
    );

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0E0E0E",
          color: "#EDEDED",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            textAlign: "center",
            border: "1px solid #262626",
            borderRadius: 14,
            padding: 32,
            background: "#151515",
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 800, color: "#5DFF00", marginBottom: 8 }}>
            {stale ? "La app se ha actualizado" : "Algo ha ido mal"}
          </div>
          <p style={{ color: "#9A9A9A", fontSize: 14, marginBottom: 24 }}>
            {stale
              ? "Se ha desplegado una versión nueva mientras tenías la página abierta. Recarga para continuar."
              : "Ha ocurrido un error inesperado. Recarga la página o reintenta."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#5DFF00",
                color: "#0E0E0E",
                border: "none",
                borderRadius: 8,
                padding: "10px 18px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Recargar
            </button>
            {!stale && (
              <button
                onClick={() => reset()}
                style={{
                  background: "#262626",
                  color: "#EDEDED",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Reintentar
              </button>
            )}
          </div>
          {error?.digest && (
            <div style={{ color: "#666", fontSize: 11, marginTop: 16 }}>ref: {error.digest}</div>
          )}
        </div>
      </body>
    </html>
  );
}
