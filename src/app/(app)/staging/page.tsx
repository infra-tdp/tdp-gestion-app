import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { Card, PageHeader, StatusBadge, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staging devs" };

export default async function StagingListPage() {
  await requirePermission("staging.view");

  const envs = await db
    .select({ env: schema.stagingEnvs, userName: schema.users.name })
    .from(schema.stagingEnvs)
    .leftJoin(schema.users, eq(schema.stagingEnvs.requestedBy, schema.users.id))
    .orderBy(desc(schema.stagingEnvs.createdAt))
    .limit(50);

  return (
    <>
      <PageHeader
        eyebrow="Entornos efímeros de la web"
        title="Staging devs"
        actions={
          <Link href="/staging/new" className="btn-primary uppercase">
            + Solicitar entorno
          </Link>
        }
      />

      <Card accent={false} className="!p-0 overflow-x-auto">
        <table className="tdp-table">
          <thead>
            <tr>
              <th>Entorno</th>
              <th>Estado</th>
              <th>Imagen</th>
              <th>Rama</th>
              <th>PR</th>
              <th>Dev</th>
              <th>Caduca</th>
            </tr>
          </thead>
          <tbody>
            {envs.map(({ env, userName }) => (
              <tr key={env.id}>
                <td>
                  <Link href={`/staging/${env.id}`} className="font-semibold text-primary">
                    {env.slug}
                  </Link>
                </td>
                <td>
                  <StatusBadge status={env.status} />
                </td>
                <td className="text-muted">:{env.imageTag}</td>
                <td className="text-muted">{env.branch}</td>
                <td>
                  {env.prUrl ? (
                    <a href={env.prUrl} target="_blank" rel="noreferrer" className="text-primary font-semibold">
                      #{env.prNumber}
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="text-muted">{userName ?? "—"}</td>
                <td className="text-muted">{env.expiresAt ? timeAgo(env.expiresAt).replace("hace", "en") : "—"}</td>
              </tr>
            ))}
            {envs.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted text-center py-8">
                  Nadie ha solicitado un entorno todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
