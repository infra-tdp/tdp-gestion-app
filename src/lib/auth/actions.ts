"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { isMailConfigured } from "@/lib/mail";
import { createSession, destroySession, type SessionUser } from "./session";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_MINUTES,
  DEVICE_COOKIE,
  checkTrustedDevice,
  createChallenge,
  getChallenge,
  trustDevice,
  TRUST_DAYS,
  verifyChallengeCode,
} from "./two-factor";

/**
 * Bootstrap: si no existe ningún usuario, crea el ADMIN inicial a partir de
 * ADMIN_EMAIL / ADMIN_PASSWORD (variables de Coolify). Idempotente.
 */
export async function ensureAdminSeed(): Promise<void> {
  const [any] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (any) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  await db.insert(schema.users).values({
    email: email.toLowerCase(),
    name: "Central TDP",
    passwordHash: await bcrypt.hash(password, 12),
    role: "ADMIN",
  });
  console.log(`[auth] usuario ADMIN inicial creado: ${email}`);
}

export type LoginState = { error?: string };

const secureCookie = () => process.env.NODE_ENV === "production";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Introduce email y contraseña" };

  await ensureAdminSeed();

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  // Comparación aunque no exista el usuario — mismo coste de tiempo (anti-enumeración)
  const hash = user?.passwordHash ?? "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZUpZ4dGpiGrzeEGx/2E6ZW5C6XA0y2";
  const ok = await bcrypt.compare(password, hash);
  if (!user || !user.active || !ok) return { error: "Credenciales incorrectas" };

  const sessionUser: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  const jar = await cookies();

  // Dispositivo de confianza vigente (máx. 7 días): entra sin repetir el 2FA
  // con una sesión que dura hasta la caducidad del recuerdo.
  const device = await checkTrustedDevice(user.id, jar.get(DEVICE_COOKIE)?.value);
  if (device.trusted && device.expiresAt) {
    await createSession(sessionUser, Math.floor((device.expiresAt.getTime() - Date.now()) / 1000));
    redirect("/");
  }

  // 2FA por email exige SMTP configurado: si aún no lo está (bootstrap), acceso
  // directo para no dejar fuera a todo el mundo — se avisa por consola.
  if (user.twoFactorMethod === "EMAIL" && !(await isMailConfigured())) {
    console.warn("[auth] SMTP sin configurar: login sin 2FA para", user.email);
    await createSession(sessionUser);
    redirect("/");
  }

  const challenge = await createChallenge({
    id: user.id,
    email: user.email,
    name: user.name,
    method: user.twoFactorMethod,
  });
  if (challenge.error) return { error: challenge.error };

  jar.set(CHALLENGE_COOKIE, challenge.id, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MINUTES * 60,
  });
  redirect("/login/verify");
}

/* ------------------------- Verificación en dos pasos ----------------------- */

export type VerifyInfo = {
  method: "EMAIL" | "TOTP";
  /** Correo enmascarado (a••@dominio) al que se envió la clave (solo EMAIL) */
  maskedEmail?: string;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}•••@${domain}`;
}

/** Contexto del desafío pendiente para pintar /login/verify (null → volver a /login). */
export async function getPendingChallengeInfo(): Promise<VerifyInfo | null> {
  const id = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!id) return null;
  const challenge = await getChallenge(id);
  if (!challenge) return null;
  if (challenge.method === "TOTP") return { method: "TOTP" };
  const [user] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, challenge.userId))
    .limit(1);
  return { method: "EMAIL", maskedEmail: user ? maskEmail(user.email) : undefined };
}

export type VerifyState = { error?: string };

export async function verify2faAction(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  const challenge = id ? await getChallenge(id) : null;
  if (!challenge) redirect("/login");

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, challenge.userId))
    .limit(1);
  if (!user || !user.active) redirect("/login");

  const res = await verifyChallengeCode(challenge, String(formData.get("code") ?? ""), user.totpSecret);
  if (!res.ok) return { error: res.error };

  jar.delete(CHALLENGE_COOKIE);
  const sessionUser: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };

  if (formData.get("remember") === "on") {
    // Recordar ESTE dispositivo un máximo de TRUST_DAYS días: la sesión y la
    // cookie de confianza caducan a la vez.
    const ua = (await headers()).get("user-agent");
    const { token, expiresAt } = await trustDevice(user.id, ua);
    jar.set(DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: TRUST_DAYS * 24 * 3600,
    });
    await createSession(sessionUser, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  } else {
    await createSession(sessionUser);
  }
  redirect("/");
}

/** Reenvía la clave temporal por email (crea un desafío nuevo). */
export async function resendCodeAction(_prev: VerifyState, _formData: FormData): Promise<VerifyState> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  const challenge = id ? await getChallenge(id) : null;
  if (!challenge) redirect("/login");
  if (challenge.method !== "EMAIL") return { error: "Este acceso usa la app de autenticación" };

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, challenge.userId))
    .limit(1);
  if (!user || !user.active) redirect("/login");

  const fresh = await createChallenge({
    id: user.id,
    email: user.email,
    name: user.name,
    method: "EMAIL",
  });
  if (fresh.error) return { error: fresh.error };
  jar.set(CHALLENGE_COOKIE, fresh.id, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MINUTES * 60,
  });
  return {};
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
