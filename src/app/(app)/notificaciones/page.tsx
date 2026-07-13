import { desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { markNotificationsRead } from "@/lib/actions/users";
import { Card, PageHeader, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const notes = await db
    .select()
    .from(schema.notifications)
    .where(or(isNull(schema.notifications.userId), eq(schema.notifications.userId, user.id)))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(100);

  return (
    <>
      <PageHeader
        eyebrow="Actividad del sistema"
        title="Notificaciones"
        actions={
          <form action={markNotificationsRead}>
            <button className="btn-dark text-[13px]" type="submit">
              Marcar como leídas
            </button>
          </form>
        }
      />
      <div className="space-y-2">
        {notes.map((n) => (
          <Card key={n.id} accent={false} className={n.read ? "opacity-60" : ""}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-semibold text-sm">{n.title}</div>
                {n.body && <div className="text-muted text-[13px] mt-0.5 break-all">{n.body}</div>}
              </div>
              <span className="text-muted text-[12px] shrink-0">{timeAgo(n.createdAt)}</span>
            </div>
          </Card>
        ))}
        {notes.length === 0 && (
          <Card accent={false}>
            <p className="text-muted text-sm">
              Sin notificaciones. Aquí verás caídas de servicios, stagings listos, PRs, movimientos de nodos… y en las
              fases CRM: ventas, roturas de stock y reposiciones.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
