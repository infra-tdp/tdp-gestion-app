import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const COOKIE_NAME = "tdp_session";
const SESSION_HOURS = 12;

export type Role = "ADMIN" | "INFRA" | "DEV" | "STORE" | "VIEWER";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no está definido");
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** Usuario de la sesión actual (cacheado por request). null si no hay sesión válida. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    if (!id) return null;
    // Revalidamos contra BD: usuarios desactivados o con rol cambiado pierden acceso al momento
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!row || !row.active) return null;
    return { id: row.id, email: row.email, name: row.name, role: row.role };
  } catch {
    return null;
  }
});

/** Nombre de la cookie — lo usa el middleware (edge, sin acceso a BD). */
export const SESSION_COOKIE = COOKIE_NAME;
