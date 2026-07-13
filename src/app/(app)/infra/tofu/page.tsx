import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import { listStacks, tofuConfigured } from "@/lib/infra/tofu";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, timeAgo } from "@/components/ui";
import { TofuLauncher } from "./tofu-launcher";

export const dynamic = "force-dynamic";
export const metadata = { title: "OpenTofu" };

export default async function TofuPage() {
  const user = await requirePermission("tofu.view");
  const canApply = hasPermission(user.role, "tofu.apply");
  const canPlan = hasPermission(user.role, "tofu.plan");

  const [stacks, runs] = await Promise.all([
    listStacks(),
    db
      .select({
        run: schema.tofuRuns,
        userName: schema.users.name,
      })
      .from(schema.tofuRuns)
      .leftJoin(schema.users, eq(schema.tofuRuns.triggeredBy, schema.users.id))
      .orderBy(desc(schema.tofuRuns.createdAt))
      .limit(30),
  ]);

  return (
    <>
      <PageHeader eyebrow="Infraestructura como código" title="OpenTofu" />

      {!tofuConfigured() && (
        <div className="mb-4">
          <EmptyState
            title="Runner sin configurar"
            detail="Necesita PG_CONN_STR (backend pg del estado) y GITHUB_TOKEN (clonar tdp-tienda-infra). Las credenciales del provider van en UPCLOUD_USERNAME/PASSWORD."
          />
        </div>
      )}

      {canPlan && (
        <Card className="mb-4">
          <h2 className="headline text-2xl mb-3">Lanzar ejecución</h2>
          <p className="text-muted text-sm mb-4">
            Ejecuta <code className="text-primary">plan</code> o <code className="text-primary">apply</code> sobre un stack de{" "}
            <code>infra/tofu/live</code> del repo de infraestructura (siempre desde <code>origin/main</code>, estado en
            PostgreSQL con advisory locks).
          </p>
          <TofuLauncher stacks={stacks} canApply={canApply} />
        </Card>
      )}

      <Card accent={false} className="!p-0 overflow-x-auto">
        <table className="tdp-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Stack</th>
              <th>Acción</th>
              <th>Estado</th>
              <th>Por</th>
              <th>Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(({ run, userName }) => (
              <tr key={run.id}>
                <td>
                  <Link href={`/infra/tofu/runs/${run.id}`} className="font-semibold text-primary">
                    #{run.id}
                  </Link>
                </td>
                <td className="font-semibold">{run.stack}</td>
                <td>
                  <Badge tone="outline">{run.action}</Badge>
                </td>
                <td>
                  <StatusBadge status={run.status} />
                </td>
                <td className="text-muted">{userName ?? "—"}</td>
                <td className="text-muted">{timeAgo(run.createdAt)}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted text-center py-8">
                  Sin ejecuciones todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
