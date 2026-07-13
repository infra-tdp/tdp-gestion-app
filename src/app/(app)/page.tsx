import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { monitorSummaries } from "@/lib/infra/monitors";
import { listServers, upcloudConfigured, type UpcloudServer } from "@/lib/infra/upcloud";
import { Badge, Card, EmptyState, Kpi, PageHeader, StatusBadge, StatusDot, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [monitors, stagings, runs, notes] = await Promise.all([
    monitorSummaries().catch(() => []),
    db
      .select()
      .from(schema.stagingEnvs)
      .where(inArray(schema.stagingEnvs.status, ["pending", "provisioning", "active", "error"]))
      .orderBy(desc(schema.stagingEnvs.createdAt))
      .limit(8),
    db.select().from(schema.tofuRuns).orderBy(desc(schema.tofuRuns.createdAt)).limit(5),
    db.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)).limit(6),
  ]);

  let servers: UpcloudServer[] = [];
  let upcloudError: string | null = null;
  if (upcloudConfigured()) {
    try {
      servers = await listServers();
    } catch (err) {
      upcloudError = err instanceof Error ? err.message : String(err);
    }
  }

  const monitorsUp = monitors.filter((m) => m.lastCheck?.ok).length;
  const monitorsDown = monitors.filter((m) => m.lastCheck && !m.lastCheck.ok).length;
  const nodesUp = servers.filter((s) => s.state === "started").length;

  return (
    <>
      <PageHeader eyebrow={`Hola, ${user.name}`} title="Centro de control" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Disponibilidad"
          value={monitorsDown === 0 ? "OK" : monitorsDown === 1 ? "1 caído" : `${monitorsDown} caídos`}
          tone={monitorsDown === 0 ? "success" : "danger"}
          detail={`${monitorsUp}/${monitors.length} servicios respondiendo`}
        />
        <Kpi
          label="Nodos UpCloud"
          value={upcloudConfigured() ? (upcloudError ? "—" : `${nodesUp}/${servers.length}`) : "—"}
          tone={upcloudError ? "danger" : "default"}
          detail={
            upcloudError
              ? "Error consultando la API"
              : upcloudConfigured()
                ? "encendidos"
                : "Configura UPCLOUD_USERNAME/PASSWORD"
          }
        />
        <Kpi
          label="Stagings activos"
          value={stagings.filter((s) => s.status === "active").length}
          detail={`${stagings.filter((s) => s.status === "provisioning" || s.status === "pending").length} provisionando`}
        />
        <Kpi
          label="Runs tofu (últimos)"
          value={runs.filter((r) => r.status === "success").length + "/" + runs.length}
          tone={runs.some((r) => r.status === "error") ? "warning" : "default"}
          detail="correctos"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="headline text-2xl">Disponibilidad</h2>
            <Link href="/infra/monitors" className="text-primary text-[13px] font-bold uppercase">
              Ver todo →
            </Link>
          </div>
          {monitors.length === 0 ? (
            <p className="text-muted text-sm">Sin monitores. Añádelos en Disponibilidad.</p>
          ) : (
            <ul className="space-y-2.5">
              {monitors.slice(0, 6).map(({ monitor, lastCheck, uptime24h }) => (
                <li key={monitor.id} className="flex items-center gap-3 text-sm">
                  <StatusDot ok={lastCheck ? lastCheck.ok : null} />
                  <span className="font-semibold">{monitor.name}</span>
                  <span className="text-muted truncate flex-1">{monitor.url}</span>
                  <span className="text-muted">{uptime24h !== null ? `${uptime24h}% 24h` : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="headline text-2xl">Staging devs</h2>
            <Link href="/staging" className="text-primary text-[13px] font-bold uppercase">
              Ver todo →
            </Link>
          </div>
          {stagings.length === 0 ? (
            <p className="text-muted text-sm">No hay entornos activos.</p>
          ) : (
            <ul className="space-y-2.5">
              {stagings.map((env) => (
                <li key={env.id} className="flex items-center gap-3 text-sm">
                  <StatusBadge status={env.status} />
                  <Link href={`/staging/${env.id}`} className="font-semibold hover:text-primary">
                    {env.slug}
                  </Link>
                  <span className="text-muted">:{env.imageTag}</span>
                  <span className="text-muted ml-auto">{timeAgo(env.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="headline text-2xl">Últimos runs de tofu</h2>
            <Link href="/infra/tofu" className="text-primary text-[13px] font-bold uppercase">
              Ver todo →
            </Link>
          </div>
          {runs.length === 0 ? (
            <p className="text-muted text-sm">Aún no se ha ejecutado ningún plan/apply.</p>
          ) : (
            <ul className="space-y-2.5">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center gap-3 text-sm">
                  <StatusBadge status={run.status} />
                  <Link href={`/infra/tofu/runs/${run.id}`} className="font-semibold hover:text-primary">
                    {run.stack}
                  </Link>
                  <Badge tone="outline">{run.action}</Badge>
                  <span className="text-muted ml-auto">{timeAgo(run.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="headline text-2xl">Actividad</h2>
            <Link href="/notificaciones" className="text-primary text-[13px] font-bold uppercase">
              Ver todo →
            </Link>
          </div>
          {notes.length === 0 ? (
            <p className="text-muted text-sm">Sin actividad todavía.</p>
          ) : (
            <ul className="space-y-2.5">
              {notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <span className="font-semibold">{n.title}</span>
                  <span className="text-muted ml-2">{timeAgo(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {servers.length === 0 && !upcloudError && upcloudConfigured() && (
        <div className="mt-4">
          <EmptyState title="Sin nodos visibles" detail="La sub-cuenta de API de UpCloud no ve servidores. Revisa sus permisos." />
        </div>
      )}
    </>
  );
}
