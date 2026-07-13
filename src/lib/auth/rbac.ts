import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type Role, type SessionUser } from "./session";

/**
 * RBAC — matriz de permisos por módulo.
 *
 *  ADMIN  central: todo.
 *  INFRA  operaciones: nodos, tofu apply, monitores, staging de cualquiera.
 *  DEV    desarrollo: staging propio, claves SSH, PRs, lectura de infra.
 *  STORE  tiendas (fases CRM): solo sus datos. Sin acceso a infraestructura.
 *  VIEWER solo lectura de dashboards.
 */
const PERMISSIONS = {
  "infra.view": ["ADMIN", "INFRA", "DEV", "VIEWER"],
  "infra.nodes.manage": ["ADMIN", "INFRA"],
  "tofu.view": ["ADMIN", "INFRA", "DEV"],
  "tofu.plan": ["ADMIN", "INFRA"],
  "tofu.apply": ["ADMIN", "INFRA"],
  "monitors.view": ["ADMIN", "INFRA", "DEV", "VIEWER"],
  "monitors.manage": ["ADMIN", "INFRA"],
  "staging.view": ["ADMIN", "INFRA", "DEV"],
  "staging.request": ["ADMIN", "INFRA", "DEV"],
  "staging.destroy.any": ["ADMIN", "INFRA"],
  "pr.create": ["ADMIN", "INFRA", "DEV"],
  "pr.merge": ["ADMIN", "INFRA"],
  "users.manage": ["ADMIN"],
  "ai.use": ["ADMIN", "INFRA", "DEV"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Para páginas: redirige a /login sin sesión y a / sin permiso. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, permission)) redirect("/");
  return user;
}

/** Para server actions y APIs: lanza en vez de redirigir. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("No autenticado");
  if (!hasPermission(user.role, permission)) throw new Error("Sin permiso: " + permission);
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
