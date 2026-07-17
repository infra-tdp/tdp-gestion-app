import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "tdp_session";
const PUBLIC_PATHS = ["/login", "/api/health"];

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
