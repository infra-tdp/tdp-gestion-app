import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Permission } from "@/lib/auth/rbac";

/**
 * Árbol de navegación de gestión.
 *
 * El árbol BASE vive aquí en código (ids ESTABLES: no cambiarlos, son la clave
 * de las personalizaciones). Desde Administración → "Menú de navegación" se
 * pueden renombrar nodos y reordenarlos; esos cambios se guardan en
 * app_settings["nav.overrides"] y se aplican con `applyNavOverrides` encima del
 * árbol base — así el menú crece por código pero se organiza desde la UI.
 */
export type NavLeafDef = {
  id: string;
  href: string;
  label: string;
  icon?: string;
  /** Permiso requerido (lo filtra el layout en el servidor). */
  permission?: Permission;
  badge?: "notifications";
};
export type NavGroupDef = { id: string; label: string; icon?: string; children: NavDef[] };
export type NavDef = NavLeafDef | NavGroupDef;

export const isGroupDef = (n: NavDef): n is NavGroupDef => "children" in n;

export const NAV: NavDef[] = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: "dashboard" },
  {
    id: "infra",
    label: "Infraestructura TI",
    icon: "infra",
    children: [
      {
        id: "infra.servers",
        label: "Servidores",
        icon: "server",
        children: [
          { id: "infra.nodes", href: "/infra/nodes", label: "Nodos", icon: "server", permission: "infra.view" },
          { id: "infra.tofu", href: "/infra/tofu", label: "OpenTofu", icon: "workflow", permission: "tofu.view" },
          { id: "infra.monitors", href: "/infra/monitors", label: "Disponibilidad", icon: "radio", permission: "monitors.view" },
        ],
      },
      {
        id: "infra.apps",
        label: "Apps",
        icon: "apps",
        children: [
          { id: "apps.staging", href: "/staging", label: "Staging devs", icon: "staging", permission: "staging.view" },
          { id: "apps.registry", href: "/infra/apps", label: "Registro de Apps", icon: "apps", permission: "apps.view" },
        ],
      },
      {
        id: "infra.security",
        label: "Seguridad",
        icon: "security",
        children: [
          { id: "security.ssh", href: "/settings/ssh-keys", label: "Claves SSH", icon: "keys" },
        ],
      },
    ],
  },
  {
    id: "assistants",
    label: "Asistentes",
    icon: "bot",
    children: [
      { id: "assistants.ai", href: "/asistente", label: "Asistente IA", icon: "bot", permission: "ai.use" },
      { id: "assistants.whatsapp", href: "/agente", label: "Agente WhatsApp", icon: "whatsapp", permission: "agente.view" },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    icon: "users",
    children: [
      { id: "admin.users", href: "/admin/users", label: "Usuarios", icon: "users", permission: "users.manage" },
      { id: "admin.roles", href: "/admin/roles", label: "Roles y permisos", icon: "roles", permission: "roles.manage" },
      { id: "admin.nav", href: "/admin/nav", label: "Menú de navegación", icon: "menu", permission: "nav.manage" },
    ],
  },
  { id: "notifications", href: "/notificaciones", label: "Notificaciones", icon: "bell", badge: "notifications" },
];

/* ------------------------- Personalización (overrides) -------------------- */

export const NAV_SETTINGS_KEY = "nav.overrides";
/** Clave del nivel raíz en `order`. */
export const NAV_ROOT = "__root";

export type NavOverrides = {
  /** id de nodo → etiqueta personalizada */
  labels?: Record<string, string>;
  /** id de grupo (o __root) → ids de sus hijos en el orden elegido */
  order?: Record<string, string[]>;
};

export async function loadNavOverrides(): Promise<NavOverrides> {
  try {
    const [row] = await db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, NAV_SETTINGS_KEY))
      .limit(1);
    return (row?.value as NavOverrides) ?? {};
  } catch {
    return {}; // BD aún no lista: árbol base
  }
}

export async function saveNavOverrides(ov: NavOverrides): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key: NAV_SETTINGS_KEY, value: ov })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: ov, updatedAt: new Date() },
    });
}

export async function resetNavOverrides(): Promise<void> {
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, NAV_SETTINGS_KEY));
}

/**
 * Aplica renombres y reordenaciones sobre el árbol base. Ids desconocidos en
 * `order` se ignoran; nodos nuevos (aún sin ordenar) quedan al final en su
 * orden de código — añadir pantallas nunca rompe la personalización guardada.
 */
export function applyNavOverrides(nodes: NavDef[], ov: NavOverrides, parentId = NAV_ROOT): NavDef[] {
  const orderList = ov.order?.[parentId];
  let sorted = nodes;
  if (orderList?.length) {
    const pos = new Map(orderList.map((id, i) => [id, i]));
    sorted = [...nodes].sort((a, b) => {
      const pa = pos.get(a.id) ?? orderList.length + nodes.indexOf(a);
      const pb = pos.get(b.id) ?? orderList.length + nodes.indexOf(b);
      return pa - pb;
    });
  }
  return sorted.map((n) => {
    const label = ov.labels?.[n.id]?.trim() || n.label;
    return isGroupDef(n)
      ? { ...n, label, children: applyNavOverrides(n.children, ov, n.id) }
      : { ...n, label };
  });
}
