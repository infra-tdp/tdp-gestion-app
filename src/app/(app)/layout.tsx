import { and, count, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { ensureRbacLoaded, hasPermission, type Permission } from "@/lib/auth/rbac";
import { logoutAction } from "@/lib/auth/actions";
import { APP_VERSION, appCommit } from "@/lib/version";
import { Sidebar, type NavNode } from "@/components/sidebar";

export const dynamic = "force-dynamic";

/**
 * Árbol de navegación. Grupos plegables (con `children`) + hojas (con `href`),
 * de profundidad libre — pensado para ir creciendo con los módulos de gestión
 * de la empresa. El permiso se declara en la hoja; un grupo se muestra solo si
 * al menos una de sus hojas es visible para el rol (filtrado recursivo abajo).
 */
type NavLeafSrc = { href: string; label: string; icon?: string; permission?: Permission; badge?: "notifications" };
type NavGroupSrc = { label: string; icon?: string; children: NavSrc[] };
type NavSrc = NavLeafSrc | NavGroupSrc;
const isGroupSrc = (n: NavSrc): n is NavGroupSrc => "children" in n;

const NAV: NavSrc[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  {
    label: "Infraestructura TI",
    icon: "infra",
    children: [
      {
        label: "Servidores",
        icon: "server",
        children: [
          { href: "/infra/nodes", label: "Nodos", icon: "server", permission: "infra.view" },
          { href: "/infra/tofu", label: "OpenTofu", icon: "workflow", permission: "tofu.view" },
          { href: "/infra/monitors", label: "Disponibilidad", icon: "radio", permission: "monitors.view" },
        ],
      },
      {
        label: "Apps",
        icon: "apps",
        children: [
          { href: "/staging", label: "Staging devs", icon: "staging", permission: "staging.view" },
          { href: "/infra/apps", label: "Registro de Apps", icon: "apps", permission: "apps.view" },
        ],
      },
      {
        label: "Seguridad",
        icon: "security",
        children: [
          { href: "/settings/ssh-keys", label: "Claves SSH", icon: "keys" },
        ],
      },
    ],
  },
  {
    label: "Asistentes",
    icon: "bot",
    children: [
      { href: "/asistente", label: "Asistente IA", icon: "bot", permission: "ai.use" },
      { href: "/agente", label: "Agente WhatsApp", icon: "whatsapp", permission: "agente.view" },
    ],
  },
  {
    label: "Administración",
    icon: "users",
    children: [
      { href: "/admin/users", label: "Usuarios", icon: "users", permission: "users.manage" },
      { href: "/admin/roles", label: "Roles y permisos", icon: "roles", permission: "roles.manage" },
    ],
  },
  { href: "/notificaciones", label: "Notificaciones", icon: "bell", badge: "notifications" },
];

/** Filtra el árbol por permisos: descarta hojas sin permiso y grupos que queden vacíos. */
function filterNav(nodes: NavSrc[], role: Parameters<typeof hasPermission>[0]): NavNode[] {
  const out: NavNode[] = [];
  for (const node of nodes) {
    if (isGroupSrc(node)) {
      const children = filterNav(node.children, role);
      if (children.length) out.push({ label: node.label, icon: node.icon as NavNode["icon"], children });
    } else if (!node.permission || hasPermission(role, node.permission)) {
      out.push({ ...node, icon: node.icon as NavNode["icon"] });
    }
  }
  return out;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureRbacLoaded();
  const items = filterNav(NAV, user.role);

  const [unreadRow] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.read, false),
        or(isNull(schema.notifications.userId), eq(schema.notifications.userId, user.id)),
      ),
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar
        items={items}
        userName={user.name}
        userRole={user.role}
        unread={unreadRow?.n ?? 0}
        logout={logoutAction}
      />
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="px-8 py-8 max-w-[1280px] w-full flex-1">{children}</div>
        <footer className="px-8 py-3 border-t border-border-dark text-muted text-[12px] flex items-center gap-2">
          <span>TDP Gestión</span>
          <span className="text-primary font-semibold">v{APP_VERSION}</span>
          {appCommit() && <span className="opacity-70">· {appCommit()}</span>}
        </footer>
      </main>
    </div>
  );
}
