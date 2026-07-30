import "server-only";
import { redirect } from "next/navigation";
import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUser, type Role, type SessionUser } from "./session";

/**
 * RBAC DINÁMICO — roles en BD (tabla `roles`) + permisos por rol (tabla
 * `role_permissions`), todo gestionable desde /admin/roles.
 *
 * El CATÁLOGO de permisos (las "funciones/pantallas" de gestión) vive en código:
 * `DEFAULT_PERMISSIONS` define cada permiso y su asignación semilla. Invariantes
 * de seguridad, resueltas en código y no en BD:
 *   · ADMIN (rol de sistema, solo lectura) SIEMPRE tiene TODOS los permisos,
 *     incluidos los que se añadan en el futuro (anti-lockout).
 *   · Los permisos de LOCKED_PERMISSIONS quedan fijos en ADMIN (sin escalada).
 * La matriz efectiva se cachea en memoria (una réplica) y se recarga en cada
 * cambio y al arrancar.
 */
const DEFAULT_PERMISSIONS = {
  "infra.view": ["ADMIN", "INFRA", "DEV", "VIEWER"],
  "infra.nodes.manage": ["ADMIN", "INFRA"],
  "tofu.view": ["ADMIN", "INFRA", "DEV"],
  "tofu.plan": ["ADMIN", "INFRA"],
  "tofu.apply": ["ADMIN", "INFRA"],
  "apps.view": ["ADMIN", "INFRA", "DEV"],
  "apps.manage": ["ADMIN", "INFRA"],
  "monitors.view": ["ADMIN", "INFRA", "DEV", "VIEWER"],
  "monitors.manage": ["ADMIN", "INFRA"],
  "staging.view": ["ADMIN", "INFRA", "DEV"],
  "staging.request": ["ADMIN", "INFRA", "DEV"],
  "staging.destroy.any": ["ADMIN", "INFRA"],
  "pr.create": ["ADMIN", "INFRA", "DEV"],
  "pr.merge": ["ADMIN", "INFRA"],
  "ai.use": ["ADMIN", "INFRA", "DEV"],
  "agente.view": ["ADMIN", "INFRA", "DEV"],
  "agente.manage": ["ADMIN", "INFRA"],
  "users.manage": ["ADMIN"],
  "roles.manage": ["ADMIN"],
  "nav.manage": ["ADMIN"],
} as const satisfies Record<string, readonly string[]>;

export type Permission = keyof typeof DEFAULT_PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(DEFAULT_PERMISSIONS) as Permission[];

/** Bloqueados: solo ADMIN y NO editables en la UI (las "llaves del reino"). */
export const LOCKED_PERMISSIONS: readonly Permission[] = [
  "users.manage",
  "roles.manage",
  "nav.manage",
];

/** Metadatos para la pantalla de roles: módulo (agrupación) + etiqueta legible. */
export const PERMISSION_META: Record<Permission, { module: string; label: string }> = {
  "infra.view": { module: "Infraestructura", label: "Ver infraestructura" },
  "infra.nodes.manage": { module: "Infraestructura", label: "Gestionar nodos (encender/apagar)" },
  "apps.view": { module: "Apps", label: "Ver apps" },
  "apps.manage": { module: "Apps", label: "Registrar/editar apps y enrutado" },
  "tofu.view": { module: "OpenTofu", label: "Ver runs y stacks" },
  "tofu.plan": { module: "OpenTofu", label: "Ejecutar plan" },
  "tofu.apply": { module: "OpenTofu", label: "Ejecutar apply" },
  "monitors.view": { module: "Disponibilidad", label: "Ver monitores" },
  "monitors.manage": { module: "Disponibilidad", label: "Crear/editar monitores" },
  "staging.view": { module: "Staging", label: "Ver entornos de staging" },
  "staging.request": { module: "Staging", label: "Solicitar staging" },
  "staging.destroy.any": { module: "Staging", label: "Destruir staging de cualquiera" },
  "pr.create": { module: "Pull requests", label: "Abrir PRs desde el panel" },
  "pr.merge": { module: "Pull requests", label: "Mergear PRs" },
  "ai.use": { module: "Asistente", label: "Usar el asistente IA" },
  "agente.view": { module: "Agente WhatsApp", label: "Ver el agente de tareas" },
  "agente.manage": { module: "Agente WhatsApp", label: "Configurar chats, personas y modo del agente" },
  "users.manage": { module: "Administración", label: "Gestionar usuarios (bloqueado: ADMIN)" },
  "roles.manage": { module: "Administración", label: "Configurar roles/permisos (bloqueado: ADMIN)" },
  "nav.manage": { module: "Administración", label: "Organizar el menú de navegación (bloqueado: ADMIN)" },
};

/** Roles semilla de la migración (fallback si la BD aún no está lista). */
const SEED_ROLES: RoleInfo[] = [
  { key: "ADMIN", name: "Administrador", description: null, isSystem: true },
  { key: "INFRA", name: "Infraestructura", description: null, isSystem: false },
  { key: "DEV", name: "Desarrollo", description: null, isSystem: false },
  { key: "STORE", name: "Tienda", description: null, isSystem: false },
  { key: "VIEWER", name: "Solo lectura", description: null, isSystem: false },
];

/** Clave legacy en app_settings (matriz anterior); se migra a role_permissions. */
const LEGACY_SETTINGS_KEY = "rbac.overrides";

export type RoleInfo = {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
};

/* --------------------- Matriz efectiva (cache en memoria) ----------------- */

type RbacCache = {
  roles: RoleInfo[];
  /** permiso -> roles concedidos (sin ADMIN: lo tiene implícito en código) */
  matrix: Record<string, Set<string>>;
};

let cache: RbacCache | null = null;
let loadPromise: Promise<void> | null = null;

function defaultMatrix(): Record<string, Set<string>> {
  const m: Record<string, Set<string>> = {};
  for (const [p, roles] of Object.entries(DEFAULT_PERMISSIONS)) {
    m[p] = new Set(roles.filter((r) => r !== "ADMIN"));
  }
  for (const p of LOCKED_PERMISSIONS) m[p] = new Set();
  return m;
}

/** ADMIN primero, después el resto por orden de creación. */
function sortRoles(rows: RoleInfo[]): RoleInfo[] {
  return [...rows].sort((a, b) =>
    a.key === "ADMIN" ? -1 : b.key === "ADMIN" ? 1 : 0,
  );
}

/**
 * Primera carga sobre una BD recién migrada: siembra role_permissions desde los
 * defaults, fusionando la matriz legacy de app_settings si existía (y la borra).
 */
async function seedRolePermissions(roleKeys: Set<string>): Promise<void> {
  let legacy: Record<string, string[]> | null = null;
  const [row] = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, LEGACY_SETTINGS_KEY))
    .limit(1);
  if (row?.value) legacy = row.value as Record<string, string[]>;

  const values: { roleKey: string; permission: string }[] = [];
  for (const p of ALL_PERMISSIONS) {
    if (LOCKED_PERMISSIONS.includes(p)) continue;
    const granted = legacy?.[p] ?? DEFAULT_PERMISSIONS[p];
    for (const r of granted) {
      if (r !== "ADMIN" && roleKeys.has(r)) values.push({ roleKey: r, permission: p });
    }
  }
  if (values.length) {
    await db.insert(schema.rolePermissions).values(values).onConflictDoNothing();
  }
  if (row) {
    await db.delete(schema.appSettings).where(eq(schema.appSettings.key, LEGACY_SETTINGS_KEY));
  }
}

/** Recarga roles + matriz desde BD (sembrando la primera vez). */
export async function reloadRbac(): Promise<void> {
  try {
    const roleRows = await db
      .select()
      .from(schema.roles)
      .orderBy(asc(schema.roles.createdAt), asc(schema.roles.key));
    if (roleRows.length === 0) throw new Error("tabla roles vacía (BD sin migrar)");

    let permRows = await db.select().from(schema.rolePermissions);
    if (permRows.length === 0) {
      await seedRolePermissions(new Set(roleRows.map((r) => r.key)));
      permRows = await db.select().from(schema.rolePermissions);
    }

    const matrix: Record<string, Set<string>> = {};
    for (const p of ALL_PERMISSIONS) matrix[p] = new Set();
    for (const r of permRows) {
      // Ignora filas de permisos retirados del catálogo y las llaves del reino
      if (matrix[r.permission] && !LOCKED_PERMISSIONS.includes(r.permission as Permission)) {
        matrix[r.permission].add(r.roleKey);
      }
    }
    cache = {
      roles: sortRoles(
        roleRows.map((r) => ({
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
        })),
      ),
      matrix,
    };
  } catch {
    /* BD aún no lista (migraciones): defaults fail-safe, sin cachear */
    cache = null;
  }
}

/** Garantiza roles+matriz cargados (memoizado). Lo esperan los gates. */
export async function ensureRbacLoaded(): Promise<void> {
  if (cache) return;
  if (!loadPromise) {
    loadPromise = reloadRbac().finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

function currentMatrix(): Record<string, Set<string>> {
  return cache?.matrix ?? defaultMatrix();
}

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === "ADMIN") return true; // invariante: ADMIN todo, siempre
  return currentMatrix()[permission]?.has(role) ?? false;
}

/** Lista de roles (ADMIN primero). Para selects de usuarios y la pantalla de roles. */
export async function getRoles(): Promise<RoleInfo[]> {
  await ensureRbacLoaded();
  return cache?.roles ?? SEED_ROLES;
}

/** Matriz efectiva permiso → roles[] (incluye ADMIN) para pintar la pantalla. */
export async function getEffectiveMatrix(): Promise<Record<Permission, string[]>> {
  await ensureRbacLoaded();
  const roles = cache?.roles ?? SEED_ROLES;
  const m = currentMatrix();
  const out = {} as Record<Permission, string[]>;
  for (const p of ALL_PERMISSIONS) {
    out[p] = roles.filter((r) => r.key === "ADMIN" || m[p]?.has(r.key)).map((r) => r.key);
  }
  return out;
}

/* ------------------------- Gestión de roles (CRUD) ------------------------ */

const ROLE_KEY_RE = /^[A-Z][A-Z0-9_]{1,29}$/;

export async function createRole(input: {
  key: string;
  name: string;
  description?: string;
  /** Copiar los permisos de un rol existente como punto de partida */
  copyFrom?: string;
}): Promise<{ error?: string }> {
  const key = input.key.trim().toUpperCase();
  const name = input.name.trim();
  if (!ROLE_KEY_RE.test(key)) {
    return { error: "Clave inválida: MAYÚSCULAS, números y _, 2-30 caracteres, empieza por letra." };
  }
  if (!name) return { error: "El nombre es obligatorio." };
  await ensureRbacLoaded();
  try {
    await db.insert(schema.roles).values({
      key,
      name,
      description: input.description?.trim() || null,
    });
  } catch {
    return { error: `Ya existe un rol con la clave ${key}.` };
  }
  if (input.copyFrom && input.copyFrom !== "ADMIN") {
    const src = currentMatrix();
    const values = ALL_PERMISSIONS.filter((p) => src[p]?.has(input.copyFrom!)).map((p) => ({
      roleKey: key,
      permission: p,
    }));
    if (values.length) await db.insert(schema.rolePermissions).values(values).onConflictDoNothing();
  }
  await reloadRbac();
  return {};
}

export async function updateRole(
  key: string,
  input: { name: string; description?: string },
): Promise<{ error?: string }> {
  const [row] = await db.select().from(schema.roles).where(eq(schema.roles.key, key)).limit(1);
  if (!row) return { error: "Rol desconocido." };
  if (row.isSystem) return { error: "Los roles de sistema (ADMIN) son de solo lectura." };
  const name = input.name.trim();
  if (!name) return { error: "El nombre es obligatorio." };
  await db
    .update(schema.roles)
    .set({ name, description: input.description?.trim() || null })
    .where(eq(schema.roles.key, key));
  await reloadRbac();
  return {};
}

export async function deleteRole(key: string): Promise<{ error?: string }> {
  const [row] = await db.select().from(schema.roles).where(eq(schema.roles.key, key)).limit(1);
  if (!row) return { error: "Rol desconocido." };
  if (row.isSystem) return { error: "Los roles de sistema (ADMIN) no se pueden borrar." };
  const [inUse] = await db
    .select({ n: count() })
    .from(schema.users)
    .where(eq(schema.users.role, key));
  if ((inUse?.n ?? 0) > 0) {
    return { error: `Hay ${inUse!.n} usuario(s) con este rol: reasígnalos antes de borrarlo.` };
  }
  await db.delete(schema.roles).where(eq(schema.roles.key, key)); // cascade → role_permissions
  await reloadRbac();
  return {};
}

/** Activa/desactiva un permiso para un rol y persiste. Aplica invariantes. */
export async function setRolePermission(
  permission: Permission,
  roleKey: string,
  allowed: boolean,
): Promise<{ error?: string }> {
  if (!ALL_PERMISSIONS.includes(permission)) return { error: "Permiso desconocido" };
  if (roleKey === "ADMIN") return { error: "ADMIN siempre tiene todos los permisos." };
  if (LOCKED_PERMISSIONS.includes(permission)) return { error: "Permiso bloqueado a ADMIN." };
  await ensureRbacLoaded();
  if (!(cache?.roles ?? SEED_ROLES).some((r) => r.key === roleKey)) {
    return { error: "Rol desconocido" };
  }

  if (allowed) {
    await db
      .insert(schema.rolePermissions)
      .values({ roleKey, permission })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.rolePermissions)
      .where(
        and(
          eq(schema.rolePermissions.roleKey, roleKey),
          eq(schema.rolePermissions.permission, permission),
        ),
      );
  }
  await reloadRbac();
  return {};
}

/** Restablece la matriz semilla (los roles personalizados quedan sin permisos). */
export async function resetRbac(): Promise<void> {
  await db.delete(schema.rolePermissions);
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, LEGACY_SETTINGS_KEY));
  const roleRows = await db.select({ key: schema.roles.key }).from(schema.roles);
  await seedRolePermissions(new Set(roleRows.map((r) => r.key)));
  await reloadRbac();
}

/* ------------------------------- Gates ------------------------------------ */

/** Para páginas: redirige a /login sin sesión y a / sin permiso. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  await ensureRbacLoaded();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, permission)) redirect("/");
  return user;
}

/** Para server actions y APIs: lanza en vez de redirigir. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  await ensureRbacLoaded();
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
