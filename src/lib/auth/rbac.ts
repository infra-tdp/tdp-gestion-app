import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUser, type Role, type SessionUser } from "./session";

/**
 * RBAC — matriz de permisos por módulo, EDITABLE desde /admin/roles.
 *
 * `DEFAULT_PERMISSIONS` es la SEMILLA (permiso → roles). Los cambios de la UI se
 * guardan en app_settings["rbac.overrides"] y se fusionan encima. La matriz
 * efectiva se cachea en memoria (una réplica) y se recarga en cada cambio y al
 * arrancar. Invariantes de seguridad: ADMIN siempre tiene TODO (anti-lockout) y
 * roles/usuarios quedan bloqueados a ADMIN (no se pueden delegar → sin escalada).
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
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof DEFAULT_PERMISSIONS;

export const ROLES: Role[] = ["ADMIN", "INFRA", "DEV", "STORE", "VIEWER"];
export const ALL_PERMISSIONS = Object.keys(DEFAULT_PERMISSIONS) as Permission[];

/** Bloqueados: solo ADMIN y NO editables en la UI (las "llaves del reino"). */
export const LOCKED_PERMISSIONS: readonly Permission[] = ["users.manage", "roles.manage"];

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
};

const SETTINGS_KEY = "rbac.overrides";

/* --------------------- Matriz efectiva (cache en memoria) ----------------- */

let matrix: Record<string, Set<Role>> | null = null;
let loadPromise: Promise<void> | null = null;

function fromDefaults(): Record<string, Set<Role>> {
  const m: Record<string, Set<Role>> = {};
  for (const [p, roles] of Object.entries(DEFAULT_PERMISSIONS)) {
    m[p] = new Set<Role>(roles as readonly Role[]);
  }
  return m;
}

function applyInvariants(m: Record<string, Set<Role>>): void {
  for (const p of Object.keys(m)) m[p].add("ADMIN"); // ADMIN siempre todo
  for (const p of LOCKED_PERMISSIONS) m[p] = new Set<Role>(["ADMIN"]); // bloqueados
}

/** Recarga la matriz efectiva desde BD (defaults + overrides). */
export async function reloadRbac(): Promise<void> {
  const m = fromDefaults();
  try {
    const [row] = await db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, SETTINGS_KEY))
      .limit(1);
    const overrides = (row?.value ?? null) as Record<string, string[]> | null;
    if (overrides) {
      for (const [p, roles] of Object.entries(overrides)) {
        if (p in DEFAULT_PERMISSIONS) {
          m[p] = new Set(roles.filter((r): r is Role => (ROLES as string[]).includes(r)));
        }
      }
    }
  } catch {
    /* BD aún no lista (migraciones): se usan los defaults */
  }
  applyInvariants(m);
  matrix = m;
}

/** Garantiza la matriz cargada (memoizado). Lo esperan los gates de permisos. */
export async function ensureRbacLoaded(): Promise<void> {
  if (matrix) return;
  if (!loadPromise) {
    loadPromise = reloadRbac().finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

function currentMatrix(): Record<string, Set<Role>> {
  if (matrix) return matrix;
  const m = fromDefaults();
  applyInvariants(m);
  return m; // fallback fail-safe si aún no se cargó de BD
}

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === "ADMIN") return true;
  return currentMatrix()[permission]?.has(role) ?? false;
}

/** Matriz efectiva permiso → roles[] para pintar la pantalla de configuración. */
export async function getEffectiveMatrix(): Promise<Record<Permission, Role[]>> {
  await ensureRbacLoaded();
  const m = currentMatrix();
  const out = {} as Record<Permission, Role[]>;
  for (const p of ALL_PERMISSIONS) out[p] = ROLES.filter((r) => m[p]?.has(r));
  return out;
}

/** Activa/desactiva un rol en un permiso y persiste. Aplica invariantes. */
export async function setRolePermission(
  permission: Permission,
  role: Role,
  allowed: boolean,
): Promise<{ error?: string }> {
  if (!(permission in DEFAULT_PERMISSIONS)) return { error: "Permiso desconocido" };
  if (!(ROLES as string[]).includes(role)) return { error: "Rol desconocido" };
  if (role === "ADMIN") return { error: "ADMIN siempre tiene todos los permisos." };
  if (LOCKED_PERMISSIONS.includes(permission)) return { error: "Permiso bloqueado a ADMIN." };

  await ensureRbacLoaded();
  const set = new Set(ROLES.filter((r) => currentMatrix()[permission]?.has(r)));
  if (allowed) set.add(role);
  else set.delete(role);
  set.add("ADMIN");

  const [row] = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, SETTINGS_KEY))
    .limit(1);
  const overrides = ((row?.value as Record<string, string[]>) ?? {}) as Record<string, string[]>;
  overrides[permission] = Array.from(set);
  await db
    .insert(schema.appSettings)
    .values({ key: SETTINGS_KEY, value: overrides })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: overrides, updatedAt: new Date() },
    });
  await reloadRbac();
  return {};
}

/** Restablece la matriz a los valores por defecto (borra los overrides). */
export async function resetRbac(): Promise<void> {
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, SETTINGS_KEY));
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
