"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { createSession, destroySession } from "./session";

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

  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
