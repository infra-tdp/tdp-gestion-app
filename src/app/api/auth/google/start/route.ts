import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { GOOGLE_STATE_COOKIE, googleAuthUrl, isGoogleConfigured } from "@/lib/auth/google";

/**
 * Arranca el flujo OAuth con Google.
 *   ?mode=login  → botón de /login (requiere cuenta ya vinculada)
 *   ?mode=link   → vincular desde Ajustes → Seguridad (requiere sesión)
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/login?google_error=config", url));
  }

  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";
  if (mode === "link" && !(await getSessionUser())) {
    return NextResponse.redirect(new URL("/login", url));
  }

  const state = `${randomBytes(16).toString("base64url")}.${mode}`;
  const redirectUri = new URL("/api/auth/google/callback", url).toString();
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
