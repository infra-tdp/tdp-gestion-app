import { NextRequest, NextResponse } from "next/server";
import { indexingAllowed, NOINDEX_DIRECTIVES } from "@/lib/seo";

const SESSION_COOKIE = "tdp_session";
// /robots.txt debe ser público: si el gate de sesión lo redirige a /login, los
// buscadores nunca leen las directivas.
const PUBLIC_PATHS = ["/login", "/api/health", "/api/auth/google", "/robots.txt"];

/**
 * Gate de sesión a nivel edge: sin cookie → /login. La verificación criptográfica
 * y el RBAC fino se hacen en el servidor (session.ts / rbac.ts) — esto solo evita
 * servir páginas privadas a visitantes anónimos.
 */
/**
 * Evita que un proxy/CDN (Cloudflare) cachee las respuestas dinámicas de la app.
 * Sin esto, CF podía cachear la variante RSC (Content-Type text/x-component) y
 * servir el payload Flight crudo en vez del HTML. El matcher ya excluye los
 * assets estáticos (_next/static, imágenes, fuentes), que sí deben cachearse.
 */
function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  // Refuerzo de ALLOW_INDEXING: la etiqueta <meta robots> solo viaja en el HTML,
  // así que la cabecera cubre además redirecciones, respuestas de API y cualquier
  // otra cosa que un buscador pueda encontrar.
  if (!indexingAllowed()) res.headers.set("X-Robots-Tag", NOINDEX_DIRECTIVES);
  return res;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return noStore(NextResponse.next());

  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return noStore(NextResponse.redirect(url));
  }
  return noStore(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|fonts).*)"],
};
