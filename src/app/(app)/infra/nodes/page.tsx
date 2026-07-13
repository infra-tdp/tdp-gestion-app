import { requirePermission, hasPermission } from "@/lib/auth/rbac";
import { listManagedDatabases, listServers, upcloudConfigured, type UpcloudDatabase, type UpcloudServer } from "@/lib/infra/upcloud";
import { Badge, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { NodeActions } from "./node-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nodos" };

export default async function NodesPage() {
  const user = await requirePermission("infra.view");
  const canManage = hasPermission(user.role, "infra.nodes.manage");

  if (!upcloudConfigured()) {
    return (
      <>
        <PageHeader eyebrow="Infraestructura" title="Nodos UpCloud" />
        <EmptyState
          title="UpCloud sin configurar"
          detail="Define UPCLOUD_USERNAME y UPCLOUD_PASSWORD (sub-cuenta de API con mínimo privilegio) en las variables de entorno de Coolify."
        />
      </>
    );
  }

  let servers: UpcloudServer[] = [];
  let databases: UpcloudDatabase[] = [];
  let error: string | null = null;
  try {
    [servers, databases] = await Promise.all([
      listServers(),
      listManagedDatabases().catch(() => [] as UpcloudDatabase[]),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <PageHeader eyebrow="Infraestructura" title="Nodos UpCloud" />
      {error && <EmptyState title="Error consultando UpCloud" detail={error} />}

      {!error && (
        <Card accent={false} className="!p-0 overflow-x-auto">
          <table className="tdp-table">
            <thead>
              <tr>
                <th>Servidor</th>
                <th>Zona</th>
                <th>Plan</th>
                <th>IP pública</th>
                <th>Estado</th>
                {canManage && <th className="text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => {
                const publicIp = s.ip_addresses?.ip_address?.find((ip) => ip.access === "public" && ip.family === "IPv4")?.address;
                return (
                  <tr key={s.uuid}>
                    <td>
                      <div className="font-semibold">{s.title}</div>
                      <div className="text-muted text-[12px]">{s.hostname}</div>
                    </td>
                    <td className="text-muted">{s.zone}</td>
                    <td className="text-muted">
                      {s.plan} · {s.core_number} vCPU · {Number(s.memory_amount) / 1024} GB
                    </td>
                    <td className="text-muted">{publicIp ?? "—"}</td>
                    <td>
                      <StatusBadge status={s.state} />
                    </td>
                    {canManage && (
                      <td className="text-right">
                        <NodeActions uuid={s.uuid} state={s.state} />
                      </td>
                    )}
                  </tr>
                );
              })}
              {servers.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="text-muted text-center py-8">
                    Sin servidores visibles para esta sub-cuenta de API
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {databases.length > 0 && (
        <>
          <h2 className="headline text-2xl mt-8 mb-3">Bases de datos gestionadas</h2>
          <Card accent={false} className="!p-0 overflow-x-auto">
            <table className="tdp-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Motor</th>
                  <th>Plan</th>
                  <th>Zona</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((d) => (
                  <tr key={d.uuid}>
                    <td className="font-semibold">{d.title || d.name}</td>
                    <td>
                      <Badge tone="outline">{d.type}</Badge>
                    </td>
                    <td className="text-muted">{d.plan}</td>
                    <td className="text-muted">{d.zone}</td>
                    <td>
                      <StatusBadge status={d.state === "running" ? "started" : d.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
