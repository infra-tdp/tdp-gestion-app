import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import { monitorSummaries, recentChecks } from "@/lib/infra/monitors";
import { Card, PageHeader, StatusDot, timeAgo } from "@/components/ui";
import { MonitorForm, MonitorRowActions } from "./monitor-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disponibilidad" };

export default async function MonitorsPage() {
  const user = await requirePermission("monitors.view");
  const canManage = hasPermission(user.role, "monitors.manage");
  const summaries = await monitorSummaries();

  const histories = new Map<number, { ok: boolean }[]>();
  for (const s of summaries) {
    histories.set(s.monitor.id, await recentChecks(s.monitor.id, 48));
  }

  return (
    <>
      <PageHeader eyebrow="Infraestructura" title="Disponibilidad" />

      {canManage && (
        <Card className="mb-4">
          <h2 className="headline text-2xl mb-3">Añadir monitor</h2>
          <MonitorForm />
        </Card>
      )}

      <div className="space-y-3">
        {summaries.map(({ monitor, lastCheck, uptime24h, avgLatency24h }) => (
          <Card key={monitor.id} accent={false}>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusDot ok={lastCheck ? lastCheck.ok : null} />
              <div className="min-w-44">
                <div className="font-bold">{monitor.name}</div>
                <div className="text-muted text-[12px] truncate max-w-72">{monitor.url}</div>
              </div>
              {/* Barra de historial: 48 últimos checks */}
              <div className="flex items-end gap-[2px] h-7 flex-1 min-w-40" title="Últimos checks (izq = más antiguo)">
                {(histories.get(monitor.id) ?? []).map((c, i) => (
                  <span
                    key={i}
                    className="inline-block w-[5px] rounded-[1px]"
                    style={{ height: c.ok ? 22 : 10, backgroundColor: c.ok ? "#5DFF00" : "#FF3700", opacity: 0.9 }}
                  />
                ))}
                {(histories.get(monitor.id) ?? []).length === 0 && (
                  <span className="text-muted text-[12px]">sin datos</span>
                )}
              </div>
              <div className="text-right text-[13px] min-w-28">
                <div className={uptime24h !== null && uptime24h < 99 ? "text-warning font-bold" : "text-primary font-bold"}>
                  {uptime24h !== null ? `${uptime24h}%` : "—"} <span className="text-muted font-normal">24h</span>
                </div>
                <div className="text-muted">{avgLatency24h !== null ? `${avgLatency24h} ms` : "—"}</div>
              </div>
              <div className="text-muted text-[12px] min-w-20 text-right">
                {lastCheck ? timeAgo(lastCheck.checkedAt) : "nunca"}
              </div>
              {canManage && <MonitorRowActions id={monitor.id} enabled={monitor.enabled} />}
            </div>
            {lastCheck && !lastCheck.ok && (
              <div className="text-danger text-[13px] font-semibold mt-2">{lastCheck.error}</div>
            )}
          </Card>
        ))}
        {summaries.length === 0 && (
          <Card accent={false}>
            <p className="text-muted text-sm">
              Sin monitores. {canManage ? "Añade el primero arriba" : "Pide a INFRA que los configure"} — la web de
              producción, preprod, Coolify, Grafana…
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
