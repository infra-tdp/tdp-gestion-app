import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import { Badge, Card, PageHeader, StatusBadge, formatDate, timeAgo } from "@/components/ui";
import { StagingActions } from "./staging-actions";

export const dynamic = "force-dynamic";

export default async function StagingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("staging.view");
  const { id } = await params;
  const envId = Number(id);
  if (!Number.isInteger(envId)) notFound();

  const [row] = await db
    .select({ env: schema.stagingEnvs, userName: schema.users.name })
    .from(schema.stagingEnvs)
    .leftJoin(schema.users, eq(schema.stagingEnvs.requestedBy, schema.users.id))
    .where(eq(schema.stagingEnvs.id, envId));
  if (!row) notFound();
  const { env, userName } = row;

  const events = await db
    .select()
    .from(schema.stagingEvents)
    .where(eq(schema.stagingEvents.envId, envId))
    .orderBy(asc(schema.stagingEvents.id));

  const isOwner = env.requestedBy === user.id;
  const canDestroy = isOwner || hasPermission(user.role, "staging.destroy.any");
  const canMerge = hasPermission(user.role, "pr.merge") && !isOwner;
  const live = env.status === "pending" || env.status === "provisioning" || env.status === "destroying";
  const devboxHost = process.env.STAGING_DEVBOX_HOST ?? "<host-coolify>";

  return (
    <>
      <PageHeader eyebrow="Staging devs" title={env.slug} />

      <div className="flex items-center gap-3 mb-5 flex-wrap text-sm">
        <StatusBadge status={env.status} />
        <Badge tone="outline">:{env.imageTag}</Badge>
        <span className="text-muted">de {userName ?? "—"}</span>
        <span className="text-muted">· creado {formatDate(env.createdAt)}</span>
        {env.expiresAt && <span className="text-muted">· caduca {timeAgo(env.expiresAt).replace("hace", "en")}</span>}
      </div>

      {env.errorMessage && (
        <Card accent={false} className="mb-4 !border-danger">
          <div className="text-danger font-bold text-sm">{env.errorMessage}</div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <h2 className="headline text-2xl mb-3">Accesos</h2>
          <dl className="text-sm space-y-2.5">
            <div className="flex gap-2">
              <dt className="text-muted w-28 shrink-0">Web</dt>
              <dd>
                {env.url ? (
                  <a href={env.url} target="_blank" rel="noreferrer" className="text-primary font-semibold break-all">
                    {env.url}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted w-28 shrink-0">SSH devbox</dt>
              <dd>
                <code className="text-primary">ssh -p {env.devboxPort ?? "—"} wpdev@{devboxHost}</code>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted w-28 shrink-0">SFTP</dt>
              <dd>
                <code className="text-primary">sftp -P {env.devboxPort ?? "—"} wpdev@{devboxHost}</code>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted w-28 shrink-0">Rama</dt>
              <dd>
                <code>{env.branch}</code> <span className="text-muted">(ya clonada en ~/repo del devbox)</span>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted w-28 shrink-0">Backup</dt>
              <dd className="text-muted break-all">{env.backupKey ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted w-28 shrink-0">PR</dt>
              <dd>
                {env.prUrl ? (
                  <a href={env.prUrl} target="_blank" rel="noreferrer" className="text-primary font-semibold">
                    #{env.prNumber}
                  </a>
                ) : (
                  <span className="text-muted">sin abrir</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="headline text-2xl mb-3">Acciones</h2>
          <StagingActions
            envId={env.id}
            status={env.status}
            hasPr={Boolean(env.prNumber)}
            canDestroy={canDestroy}
            canMerge={canMerge}
            isOwner={isOwner}
            live={live}
          />
        </Card>
      </div>

      <Card accent={false}>
        <h2 className="headline text-2xl mb-3">Registro de provisión</h2>
        {events.length === 0 ? (
          <p className="text-muted text-sm">{live ? "Arrancando…" : "Sin eventos"}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 text-sm">
                <span className={e.ok ? "text-primary" : "text-danger"}>{e.ok ? "✔" : "✘"}</span>
                <span className="font-semibold min-w-28">{e.step}</span>
                <span className="text-muted break-all">{e.message}</span>
                <span className="text-muted ml-auto shrink-0">{timeAgo(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
