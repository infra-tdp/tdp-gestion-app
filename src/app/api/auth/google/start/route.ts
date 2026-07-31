import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  GOOGLE_STATE_COOKIE,
  googleAuthUrl,
  isGoogleConfigured,
  publicOrigin,
} from "@/lib/auth/google";

/**
 * Arranca el flujo OAuth con Google.
 *   ?mode=login  → botón de /login (requiere cuenta ya vinculada)
 *   ?mode=link   → vincular desde Mi perfil (requiere sesión)
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  // Origen público (tras Traefik, nextUrl.origin sería http://0.0.0.0:3000)
  const origin = publicOrigin(request.headers, url.origin);
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/login?google_error=config", origin));
  }

  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";
  if (mode === "link" && !(await getSessionUser())) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const state = `${randomBytes(16).toString("base64url")}.${mode}`;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const res = NextResponse.redirect(googleAuthUrl(redirectUri, state));
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
