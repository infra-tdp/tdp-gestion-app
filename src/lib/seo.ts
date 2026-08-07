/**
 * Visibilidad del panel para los buscadores.
 *
 * TDP Gestión es una herramienta interna: por defecto NO se indexa. El interruptor
 * es la variable de entorno ALLOW_INDEXING (Coolify → Environment Variables):
 *
 *   ALLOW_INDEXING sin definir | 0 | false → panel invisible (comportamiento normal)
 *   ALLOW_INDEXING=1 | true | yes | on     → se permite indexar
 *
 * Al ser "cerrado por defecto", olvidar la variable nunca expone el panel; hay que
 * pedirlo a propósito. Se aplica en tres capas, porque cada buscador mira una:
 *   1. /robots.txt          → pide no rastrear (src/app/robots.ts)
 *   2. <meta name="robots"> → pide no indexar lo que sí se haya rastreado (layout)
 *   3. Cabecera X-Robots-Tag → lo mismo pero también para respuestas no HTML
 *
 * OJO: las capas 1 y 2 se evalúan en el servidor Node (en cada petición), así que
 * basta con cambiar la variable y reiniciar; no hace falta reconstruir la imagen.
 */
export function indexingAllowed(): boolean {
  const raw = (process.env.ALLOW_INDEXING ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Directivas que se mandan cuando el panel debe quedar fuera de los buscadores. */
export const NOINDEX_DIRECTIVES = "noindex, nofollow, noarchive, nosnippet, noimageindex";
