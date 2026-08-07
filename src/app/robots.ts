import type { MetadataRoute } from "next";
import { indexingAllowed } from "@/lib/seo";

/**
 * /robots.txt — lo primero que mira un buscador antes de rastrear.
 *
 * `force-dynamic` es imprescindible: sin él Next generaría el fichero DURANTE EL
 * BUILD y dejaría congelado el valor que tuviera ALLOW_INDEXING en ese momento
 * (en Coolify, el build no ve las variables de entorno del contenedor). Así se
 * evalúa en cada petición y basta reiniciar la app tras cambiar la variable.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    // Aun permitiendo la indexación, la API y el flujo de login no pintan nada
    // en un buscador (y /api/* ni siquiera devuelve HTML).
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/login/verify"] },
  };
}
