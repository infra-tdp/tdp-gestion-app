import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { GOOGLE_STATE_COOKIE, isGoogleConfigured, verifyGoogleCode } from "@/lib/auth/google";

/**
 * Callback OAuth de Google.
 *   mode=link  → guarda el `sub` de Google en el usuario logueado (mismo email).
 *   mode=login → sesión para el usuario ya vinculado a ese `sub`. Google actúa
 *                como factor fuerte propio, así que no se repite el 2FA local.
 * Los errores vuelven como query (?google_error=…) a la pantalla de origen.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const fail = (dest: string, code: string) => {
    const res = NextResponse.redirect(new URL(`${dest}?google_error=${code}`, url));
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    return res;
  };

  if (!isGoogleConfigured()) return fail("/login", "config");

  const state = url.searchParams.get("state") ?? "";
  const cookieState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const mode = state.endsWith(".link") ? "link" : "login";
  const dest = mode === "link" ? "/settings/seguridad" : "/login";
  if (!state || state !== cookieState) return fail(dest, "state");

  const code = url.searchParams.get("code");
  if (!code) return fail(dest, "denied");

  const redirectUri = new URL("/api/auth/google/callback", url).toString();
  const identity = await verifyGoogleCode(code, redirectUri);
  if ("error" in identity) return fail(dest, "token");
  if (!identity.emailVerified) return fail(dest, "unverified");

  if (mode === "link") {
    const me = await getSessionUser();
    if (!me) return fail("/login", "session");
    // Regla de negocio: solo puede vincularse la cuenta de Google del MISMO correo
    if (identity.email !== me.email.toLowerCase()) return fail(dest, "email");
    try {
      await db
        .update(schema.users)
        .set({ googleSub: identity.sub })
        .where(eq(schema.users.id, me.id));
    } catch {
      return fail(dest, "conflict"); // ese sub ya está vinculado a otro usuario
    }
    const res = NextResponse.redirect(new URL("/settings/seguridad?google=linked", url));
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    return res;
  }

  // mode=login: la cuenta debe estar vinculada previamente (alta interna)
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.googleSub, identity.sub))
    .limit(1);
  if (!user || !user.active) return fail("/login", "nolink");
  // Defensa extra: si el email del panel cambió, exige el mismo correo también aquí
  if (user.email.toLowerCase() !== identity.email) return fail("/login", "email");

  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  const res = NextResponse.redirect(new URL("/", url));
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
}
