import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Inicio de sesión rápido con Google (OIDC). Uso INTERNO: no da de alta a
 * nadie — cada usuario vincula su cuenta de Google (mismo email) desde
 * Ajustes → Seguridad y a partir de ahí puede entrar con el botón de Google.
 *
 * Credenciales: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (OAuth Web en Google
 * Cloud Console, redirect URI <origen>/api/auth/google/callback).
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const GOOGLE_STATE_COOKIE = "tdp_goauth_state";

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean };

/** Cambia el `code` del callback por tokens y verifica el id_token (firma, aud, iss). */
export async function verifyGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleIdentity | { error: string }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    console.error("[google] intercambio de código fallido:", res.status, await res.text());
    return { error: "Google rechazó el intercambio de código" };
  }
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) return { error: "Google no devolvió id_token" };

  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      audience: process.env.GOOGLE_CLIENT_ID!,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    const sub = String(payload.sub ?? "");
    const email = String(payload.email ?? "").toLowerCase();
    if (!sub || !email) return { error: "id_token sin sub/email" };
    return { sub, email, emailVerified: payload.email_verified === true };
  } catch (e) {
    console.error("[google] id_token inválido:", e);
    return { error: "id_token de Google inválido" };
  }
}
