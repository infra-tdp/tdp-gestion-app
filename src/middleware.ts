import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "tdp_session";
const PUBLIC_PATHS = ["/login", "/api/health"];

/**
 * Gate de sesión a nivel edge: sin cookie → /login. La verificación criptográfica
 * y el RBAC fino se hacen en el servidor (session.ts / rbac.ts) — esto solo evita
 * servir páginas privadas a visitantes anónimos.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|fonts).*)"],
};
