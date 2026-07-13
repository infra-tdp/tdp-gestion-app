import { and, count, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { hasPermission, type Permission } from "@/lib/auth/rbac";
import { logoutAction } from "@/lib/auth/actions";
import { Sidebar } from "@/components/sidebar";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; icon: "dashboard" | "server" | "workflow" | "radio" | "staging" | "users" | "keys" | "bot" | "bell"; permission?: Permission }[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/infra/nodes", label: "Nodos", icon: "server", permission: "infra.view" },
  { href: "/infra/tofu", label: "OpenTofu", icon: "workflow", permission: "tofu.view" },
  { href: "/infra/monitors", label: "Disponibilidad", icon: "radio", permission: "monitors.view" },
  { href: "/staging", label: "Staging devs", icon: "staging", permission: "staging.view" },
  { href: "/notificaciones", label: "Notificaciones", icon: "bell" },
  { href: "/asistente", label: "Asistente IA", icon: "bot", permission: "ai.use" },
  { href: "/settings/ssh-keys", label: "Claves SSH", icon: "keys" },
  { href: "/admin/users", label: "Usuarios", icon: "users", permission: "users.manage" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = NAV.filter((i) => !i.permission || hasPermission(user.role, i.permission));

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
      <main className="flex-1 min-w-0 px-8 py-8 max-w-[1280px]">{children}</main>
    </div>
  );
}
