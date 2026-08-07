import { requirePermission, hasPermission } from "@/lib/auth/rbac";
import { listManagedDatabases, listServers, upcloudConfigured, type UpcloudDatabase, type UpcloudServer } from "@/lib/infra/upcloud";
import { coolifyConfigured, listServersHygiene, type ServerHygiene } from "@/lib/infra/coolify";
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
        <DockerHygiene />
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

      <DockerHygiene />
    </>
  );
}

/**
 * Higiene de disco de los nodos: si Coolify no purga los volúmenes sin usar, cada
 * ciclo de destroy/redeploy deja volúmenes huérfanos en /var/lib/docker/volumes y
 * el disco se llena solo (le pasó a coolify-prod-2: 25 GB en volúmenes sin dueño).
 *
 * La app ya evita generarlos al destruir stagings (ver deleteApp en lib/infra/coolify),
 * pero cualquier recurso borrado a mano desde el panel de Coolify sigue dejándolos,
 * así que conviene tener activada además la purga automática del servidor. Ese ajuste
 * solo se puede LEER por API (GET /servers → settings.delete_unused_volumes); para
 * cambiarlo hay que entrar en Coolify, de ahí que aquí solo se avise.
 */
async function DockerHygiene() {
  if (!coolifyConfigured()) return null;

  let servers: ServerHygiene[] = [];
  try {
    servers = await listServersHygiene();
  } catch {
    return null; // Coolify no responde: es un aviso secundario, no rompemos la página
  }
  if (servers.length === 0) return null;

  const leaking = servers.filter((s) => !s.deleteUnusedVolumes);

  return (
    <>
      <h2 className="headline text-2xl mt-8 mb-3">Limpieza de Docker en los nodos</h2>

      {leaking.length > 0 && (
        <Card className="mb-3">
          <p className="font-semibold text-warning">
            ⚠ {leaking.length === 1 ? "Un nodo acumula" : `${leaking.length} nodos acumulan`} volúmenes huérfanos
          </p>
          <p className="text-muted text-[13px] mt-1">
            {leaking.map((s) => s.name).join(", ")}: la limpieza periódica de Docker no purga volúmenes, así que
            los que quedan sin contenedor (al borrar un recurso desde el panel de Coolify) se acumulan hasta llenar
            el disco. Actívalo en Coolify → Servers → el nodo → Advanced → «Delete unused volumes». La API de
            Coolify no permite cambiar ese ajuste, por eso hay que hacerlo a mano una vez por nodo.
          </p>
        </Card>
      )}

      <Card accent={false} className="!p-0 overflow-x-auto">
        <table className="tdp-table">
          <thead>
            <tr>
              <th>Nodo (Coolify)</th>
              <th>Volúmenes sin usar</th>
              <th>Redes sin usar</th>
              <th>Frecuencia</th>
              <th>Umbral de disco</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.uuid}>
                <td>
                  <div className="font-semibold">{s.name}</div>
                  {!s.reachable && <div className="text-muted text-[12px]">sin conexión</div>}
                </td>
                <td>
                  <Badge tone={s.deleteUnusedVolumes ? "success" : "warning"}>
                    {s.deleteUnusedVolumes ? "Se purgan" : "Se acumulan"}
                  </Badge>
                </td>
                <td>
                  <Badge tone={s.deleteUnusedNetworks ? "success" : "outline"}>
                    {s.deleteUnusedNetworks ? "Se purgan" : "Se conservan"}
                  </Badge>
                </td>
                <td className="text-muted">{s.cleanupFrequency || "—"}</td>
                <td className="text-muted">{s.cleanupThreshold === null ? "—" : `${s.cleanupThreshold} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
