import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { backupsConfigured, listBackups } from "@/lib/infra/backups";
import { coolifyConfigured } from "@/lib/infra/coolify";
import { githubConfigured, listGhcrTags } from "@/lib/infra/github";
import { Card, PageHeader } from "@/components/ui";
import { StagingRequestForm } from "./request-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo staging" };

type LoadedBackups = {
  backups: Awaited<ReturnType<typeof listBackups>>;
  backupError: string | null;
};

/**
 * Carga la lista de backups distinguiendo los tres motivos por los que el
 * desplegable puede salir vacío, para poder explicárselo al usuario en la UI:
 *  1) las credenciales S3 no están configuradas,
 *  2) el bucket no es accesible (credenciales/red/permisos → excepción),
 *  3) el bucket responde pero no hay ningún dump con el prefijo esperado.
 */
async function loadBackups(): Promise<LoadedBackups> {
  if (!backupsConfigured()) {
    const missing = [
      !process.env.S3_ENDPOINT && "S3_ENDPOINT",
      !process.env.S3_BUCKET_BACKUPS && "S3_BUCKET_BACKUPS",
      !process.env.S3_BACKUP_ACCESS_KEY && "S3_BACKUP_ACCESS_KEY",
      !process.env.S3_BACKUP_SECRET_KEY && "S3_BACKUP_SECRET_KEY",
    ].filter(Boolean);
    return {
      backups: [],
      backupError: `S3 de backups sin configurar — faltan variables: ${missing.join(", ")}. Se restaurará “el más reciente” en el servidor si están disponibles allí.`,
    };
  }

  try {
    const backups = await listBackups(15);
    if (backups.length === 0) {
      const prefix = process.env.S3_BACKUPS_PREFIX ?? "db/";
      const b = process.env.S3_BUCKET_BACKUPS;
      return {
        backups,
        backupError: `El bucket “${b}” responde, pero no hay ningún dump “*.sql.gz.gpg” en el prefijo “${prefix}”. Revisa que el cron de backups esté escribiendo ahí o ajusta S3_BACKUPS_PREFIX.`,
      };
    }
    return { backups, backupError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      backups: [],
      backupError: `No se pudo listar el bucket de backups: ${msg}. Comprueba S3_ENDPOINT/región, las claves S3_BACKUP_* y que la key tenga permiso de ListBucket.`,
    };
  }
}

export default async function NewStagingPage() {
  const user = await requirePermission("staging.request");

  const [tags, backupResult, keyCount] = await Promise.all([
    githubConfigured() ? listGhcrTags().catch(() => []) : Promise.resolve([]),
    loadBackups(),
    db.$count(schema.sshKeys, eq(schema.sshKeys.userId, user.id)),
  ]);
  const { backups, backupError } = backupResult;

  const missing: string[] = [];
  if (!githubConfigured()) missing.push("GITHUB_TOKEN (rama + tags ghcr + PRs)");
  if (!coolifyConfigured()) missing.push("COOLIFY_URL / COOLIFY_TOKEN (crear el stack)");
  if (!backupsConfigured()) missing.push("S3_* + BACKUP_GPG_PASSPHRASE (restaurar el backup)");

  return (
    <>
      <PageHeader eyebrow="Staging devs" title="Solicitar entorno" />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <StagingRequestForm
            tags={tags.map((t) => t.tag)}
            backups={backups.map((b) => ({
              key: b.key,
              label: `${b.key.split("/").pop()} · ${(b.size / 1024 / 1024).toFixed(1)} MB`,
            }))}
            backupError={backupError}
            hasSshKey={keyCount > 0}
          />
        </Card>

        <div className="space-y-4">
          <Card accent={false}>
            <h3 className="headline text-xl mb-2">Qué se despliega</h3>
            <ul className="text-sm text-muted space-y-1.5 list-disc pl-4">
              <li>
                WordPress <b className="text-text">construido desde tu rama</b> (o imagen ghcr, si lo eliges)
              </li>
              <li>
                <b className="text-text">MySQL temporal</b> restaurado con un backup de producción (el más reciente por defecto)
              </li>
              <li>
                <b className="text-text">Media local</b>: las imágenes existentes cargan del CDN (como prod); tus subidas
                nuevas quedan en el entorno y mueren con él — prod nunca se toca
              </li>
              <li>
                <b className="text-text">Devbox SSH/SFTP</b> con el repo clonado en tu rama y tus claves públicas
              </li>
            </ul>
          </Card>
          <Card accent={false}>
            <h3 className="headline text-xl mb-2">Flujo de trabajo</h3>
            <ol className="text-sm text-muted space-y-1.5 list-decimal pl-4">
              <li>Se crea la rama <code>staging/&lt;tu-slug&gt;</code> desde main</li>
              <li>Edita en <code>~/repo</code> del devbox (SSH/SFTP) y haz commit + push</li>
              <li><b className="text-text">Redesplegar</b> desde la ficha para ver los cambios en vivo</li>
              <li>Abre la PR hacia main — <b className="text-text">no puedes aprobar la tuya</b></li>
              <li>Otro ADMIN/INFRA mergea → el CI publica la nueva imagen de producción</li>
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
