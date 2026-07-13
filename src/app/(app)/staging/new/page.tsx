import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { backupsConfigured, latestBackup } from "@/lib/infra/backups";
import { coolifyConfigured } from "@/lib/infra/coolify";
import { githubConfigured, listGhcrTags } from "@/lib/infra/github";
import { Card, PageHeader, formatDate } from "@/components/ui";
import { StagingRequestForm } from "./request-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo staging" };

export default async function NewStagingPage() {
  const user = await requirePermission("staging.request");

  const [tags, backup, keyCount] = await Promise.all([
    githubConfigured() ? listGhcrTags().catch(() => []) : Promise.resolve([]),
    backupsConfigured() ? latestBackup().catch(() => null) : Promise.resolve(null),
    db.$count(schema.sshKeys, eq(schema.sshKeys.userId, user.id)),
  ]);

  const missing: string[] = [];
  if (!githubConfigured()) missing.push("GITHUB_TOKEN (rama + tags ghcr + PRs)");
  if (!coolifyConfigured()) missing.push("COOLIFY_URL / COOLIFY_TOKEN (crear el stack)");
  if (!backupsConfigured()) missing.push("S3_* + BACKUP_GPG_PASSPHRASE (restaurar el backup)");

  return (
    <>
      <PageHeader eyebrow="Staging devs" title="Solicitar entorno" />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <StagingRequestForm tags={tags.map((t) => t.tag)} hasSshKey={keyCount > 0} />
        </Card>

        <div className="space-y-4">
          <Card accent={false}>
            <h3 className="headline text-xl mb-2">Qué se despliega</h3>
            <ul className="text-sm text-muted space-y-1.5 list-disc pl-4">
              <li>
                WordPress con la <b className="text-text">imagen inmutable de ghcr</b> en la versión elegida
              </li>
              <li>
                <b className="text-text">MySQL temporal</b> restaurado con el último backup de producción
                {backup && (
                  <span className="block text-[12px]">
                    último: {backup.key.split("/").pop()} · {formatDate(backup.lastModified)}
                  </span>
                )}
              </li>
              <li>
                <b className="text-text">Devbox SSH/SFTP</b> con el repo clonado en tu rama nueva y tus claves públicas
              </li>
              <li>Valkey (object cache) y nginx idénticos a producción</li>
            </ul>
          </Card>
          <Card accent={false}>
            <h3 className="headline text-xl mb-2">Flujo de trabajo</h3>
            <ol className="text-sm text-muted space-y-1.5 list-decimal pl-4">
              <li>Se crea la rama <code>staging/&lt;tu-slug&gt;</code> desde main</li>
              <li>Trabaja por SSH/SFTP en el devbox y haz commits/push a la rama</li>
              <li>Desde la ficha del entorno, abre la PR hacia main</li>
              <li>
                <b className="text-text">No puedes aprobar tu propia PR</b> — la revisa y mergea otra persona
              </li>
              <li>Al mergear, el CI publica la nueva imagen de producción automáticamente</li>
            </ol>
          </Card>
          {missing.length > 0 && (
            <Card accent={false}>
              <h3 className="headline text-xl text-warning mb-2">Configuración pendiente</h3>
              <ul className="text-sm text-muted space-y-1 list-disc pl-4">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
