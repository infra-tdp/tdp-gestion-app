import { and, count, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { ensureRbacLoaded, hasPermission } from "@/lib/auth/rbac";
import { logoutAction } from "@/lib/auth/actions";
import { APP_VERSION, appCommit } from "@/lib/version";
import { NAV, applyNavOverrides, isGroupDef, loadNavOverrides, type NavDef } from "@/lib/nav";
import { Sidebar, type NavNode } from "@/components/sidebar";

export const dynamic = "force-dynamic";

/**
 * El árbol de navegación vive en @/lib/nav (ids estables + personalización de
 * nombres/orden guardada en BD, editable en Administración → Menú de
 * navegación). Aquí solo se filtra por permisos: descarta hojas sin permiso y
 * grupos que queden vacíos.
 */
function filterNav(nodes: NavDef[], role: string): NavNode[] {
  const out: NavNode[] = [];
  for (const node of nodes) {
    if (isGroupDef(node)) {
      const children = filterNav(node.children, role);
      if (children.length) out.push({ id: node.id, label: node.label, icon: node.icon as NavNode["icon"], children });
    } else if (!node.permission || hasPermission(role, node.permission)) {
      out.push({ ...node, icon: node.icon as NavNode["icon"] });
    }
  }
  return out;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureRbacLoaded();
  const overrides = await loadNavOverrides();
  const items = filterNav(applyNavOverrides(NAV, overrides), user.role);

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
