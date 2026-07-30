"use server";

import { revalidatePath } from "next/cache";
import {
  assertPermission,
  createRole,
  deleteRole,
  resetRbac,
  setRolePermission,
  updateRole,
  type Permission,
} from "@/lib/auth/rbac";

/** Activa/desactiva un permiso para un rol (matriz por módulo). */
export async function savePermission(
  permission: Permission,
  roleKey: string,
  allowed: boolean,
): Promise<{ error?: string }> {
  await assertPermission("roles.manage");
  const res = await setRolePermission(permission, roleKey, allowed);
  if (!res.error) revalidatePath("/admin/roles");
  return res;
}

/** Restablece toda la matriz a los valores por defecto. */
export async function resetRoles(): Promise<void> {
  await assertPermission("roles.manage");
  await resetRbac();
  revalidatePath("/admin/roles");
}

/** Crea un rol nuevo (opcionalmente copiando los permisos de otro). */
export async function createRoleAction(formData: FormData): Promise<{ error?: string }> {
  await assertPermission("roles.manage");
  const res = await createRole({
    key: String(formData.get("key") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    copyFrom: String(formData.get("copyFrom") ?? "") || undefined,
  });
  if (!res.error) revalidatePath("/admin/roles");
  return res;
}

/** Renombra / cambia la descripción de un rol (los de sistema no se tocan). */
export async function updateRoleAction(
  key: string,
  name: string,
  description: string,
): Promise<{ error?: string }> {
  await assertPermission("roles.manage");
  const res = await updateRole(key, { name, description });
  if (!res.error) revalidatePath("/admin/roles");
  return res;
}

/** Borra un rol sin usuarios asignados (los de sistema no se pueden borrar). */
export async function deleteRoleAction(key: string): Promise<{ error?: string }> {
  await assertPermission("roles.manage");
  const res = await deleteRole(key);
  if (!res.error) {
    revalidatePath("/admin/roles");
    revalidatePath("/admin/users");
  }
  return res;
}
