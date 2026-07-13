"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertPermission, requireUser } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/session";

const ROLES: Role[] = ["ADMIN", "INFRA", "DEV", "STORE", "VIEWER"];

export async function createUser(formData: FormData): Promise<{ error?: string }> {
  await assertPermission("users.manage");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "VIEWER") as Role;
  if (!email.includes("@") || !name) return { error: "Email y nombre obligatorios" };
  if (password.length < 10) return { error: "La contraseña debe tener al menos 10 caracteres" };
  if (!ROLES.includes(role)) return { error: "Rol inválido" };
  try {
    await db.insert(schema.users).values({
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      role,
    });
  } catch {
    return { error: "Ya existe un usuario con ese email" };
  }
  revalidatePath("/admin/users");
  return {};
}

export async function setUserRole(userId: number, role: Role): Promise<{ error?: string }> {
  const admin = await assertPermission("users.manage");
  if (admin.id === userId) return { error: "No puedes cambiar tu propio rol" };
  if (!ROLES.includes(role)) return { error: "Rol inválido" };
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
  return {};
}

export async function setUserActive(userId: number, active: boolean): Promise<{ error?: string }> {
  const admin = await assertPermission("users.manage");
  if (admin.id === userId) return { error: "No puedes desactivarte a ti mismo" };
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
  return {};
}

export async function resetUserPassword(userId: number, password: string): Promise<{ error?: string }> {
  await assertPermission("users.manage");
  if (password.length < 10) return { error: "La contraseña debe tener al menos 10 caracteres" };
  await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(password, 12) })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
  return {};
}

/* ------------------------------ Claves SSH -------------------------------- */

export async function addSshKey(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim() || "clave";
  const publicKey = String(formData.get("publicKey") ?? "").trim();
  if (!/^(ssh-(ed25519|rsa)|ecdsa-sha2-\S+) [A-Za-z0-9+/=]+( \S+)?$/.test(publicKey)) {
    return { error: "Clave pública inválida — pega la línea completa de tu .pub (ed25519 recomendado)" };
  }
  await db.insert(schema.sshKeys).values({ userId: user.id, name, publicKey });
  revalidatePath("/settings/ssh-keys");
  return {};
}

export async function deleteSshKey(keyId: number): Promise<void> {
  const user = await requireUser();
  const [key] = await db.select().from(schema.sshKeys).where(eq(schema.sshKeys.id, keyId));
  if (!key) return;
  if (key.userId !== user.id && user.role !== "ADMIN") return;
  await db.delete(schema.sshKeys).where(eq(schema.sshKeys.id, keyId));
  revalidatePath("/settings/ssh-keys");
}

/* ---------------------------- Notificaciones ------------------------------ */

export async function markNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await db
    .update(schema.notifications)
    .set({ read: true })
    .where(eq(schema.notifications.userId, user.id));
  revalidatePath("/", "layout");
}
