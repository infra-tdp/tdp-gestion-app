"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/auth/session";
import {
  assertPermission,
  resetRbac,
  setRolePermission,
  type Permission,
} from "@/lib/auth/rbac";

/** Activa/desactiva un permiso para un rol (matriz por módulo). */
export async function savePermission(
  permission: Permission,
  role: Role,
  allowed: boolean,
): Promise<{ error?: string }> {
  await assertPermission("roles.manage");
  const res = await setRolePermission(permission, role, allowed);
  if (!res.error) revalidatePath("/admin/roles");
  return res;
}

/** Restablece toda la matriz a los valores por defecto. */
export async function resetRoles(): Promise<void> {
  await assertPermission("roles.manage");
  await resetRbac();
  revalidatePath("/admin/roles");
}
