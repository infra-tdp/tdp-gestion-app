import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import { listApps, appNodes } from "@/lib/infra/apps";
import { Card, PageHeader } from "@/components/ui";
import { AppForm, AppRowActions, RoutingActions } from "./app-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apps" };

export default async function AppsPage() {
  const user = await requirePermission("apps.view");
  const canManage = hasPermission(user.role, "apps.manage");
  const canApply = hasPermission(user.role, "tofu.apply");
  const apps = await listApps();

  return (
    <>
      <PageHeader eyebrow="Infraestructura" title="Apps" />
      <p className="text-muted text-sm -mt-3 mb-5">
        Registro de aplicaciones y su enrutado por Host en el LB (app → nodos).
      </p>

      {canManage && (
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="headline text-2xl">Registrar app</h2>
            <RoutingActions canApply={canApply} />
          </div>
          <AppForm />
          <p className="text-muted text-[12px] mt-3">
            El enrutado se aplica en el LB vía OpenTofu (stack <code>coolify-prod</code>): backend por app +
            regla por Host + health check por app. Un nodo donde la app no responde 200 se auto-excluye.
            El túnel de Cloudflare sigue apuntando al LB.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {apps.map((a) => {
          const nodes = appNodes(a);
          return (
            <Card key={a.id} accent={false}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="min-w-44">
                  <div className="font-bold">
                    {a.name} <span className="text-muted font-normal">·</span>{" "}
                    <code className="text-primary">{a.slug}</code>
                  </div>
                  <a
                    href={`https://${a.host}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted text-[12px] hover:text-primary"
                  >
                    {a.host}
                  </a>
                </div>
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-40">
                  {nodes.map((n) => (
                    <span key={n} className="badge badge-success">
                      nodo {n}
                    </span>
                  ))}
                  {nodes.length === 0 && <span className="text-warning text-[12px]">sin nodos</span>}
                </div>
                <div className="text-muted text-[12px] min-w-24 text-right">
                  :{a.port} · {a.healthPath}
                </div>
                <span className={`badge ${a.enabled ? "badge-success" : "badge-outline"}`}>
                  {a.enabled ? "activa" : "pausada"}
                </span>
                {canManage && (
                  <AppRowActions
                    id={a.id}
                    enabled={a.enabled}
                    host={a.host}
                    port={a.port}
                    healthPath={a.healthPath}
                    nodes={nodes.join(",")}
                  />
                )}
              </div>
            </Card>
          );
        })}
        {apps.length === 0 && (
          <Card accent={false}>
            <p className="text-muted text-sm">
              Sin apps registradas.{" "}
              {canManage ? "Registra la primera arriba" : "Pide a INFRA que las registre"} — cada una se
              enruta por Host a sus nodos en el LB.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
