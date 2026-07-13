import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { Badge, PageHeader, StatusBadge, formatDate } from "@/components/ui";
import { LiveLog } from "./live-log";

export const dynamic = "force-dynamic";

export default async function TofuRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("tofu.view");
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) notFound();

  const [row] = await db
    .select({ run: schema.tofuRuns, userName: schema.users.name })
    .from(schema.tofuRuns)
    .leftJoin(schema.users, eq(schema.tofuRuns.triggeredBy, schema.users.id))
    .where(eq(schema.tofuRuns.id, runId));
  if (!row) notFound();
  const { run, userName } = row;
  const live = run.status === "queued" || run.status === "running";

  return (
    <>
      <PageHeader eyebrow="OpenTofu" title={`Run #${run.id} · ${run.stack}`} />
      <div className="flex items-center gap-3 mb-4 flex-wrap text-sm">
        <StatusBadge status={run.status} />
        <Badge tone="outline">{run.action}</Badge>
        <span className="text-muted">por {userName ?? "—"}</span>
        <span className="text-muted">· creado {formatDate(run.createdAt)}</span>
        {run.gitSha && <span className="text-muted">· repo @{run.gitSha.slice(0, 8)}</span>}
        {run.exitCode !== null && <span className="text-muted">· exit {run.exitCode}</span>}
      </div>
      <LiveLog runId={run.id} initialLog={run.log} live={live} />
    </>
  );
}
