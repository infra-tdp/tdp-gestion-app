import "server-only";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Backups de la BD de la web en UpCloud Object Storage (S3-compatible).
 * Los produce scripts/backup-db.sh de tdp-tienda-infra cada noche:
 *   s3://$S3_BUCKET_BACKUPS/db/tdp_<dbname>_<fecha>.sql.gz.gpg
 * (mysqldump | gzip | gpg simétrico AES256 con BACKUP_GPG_PASSPHRASE)
 *
 * Para restaurar en staging generamos una URL prefirmada de descarga — así el
 * contenedor de restore no necesita credenciales S3, solo la URL temporal y la
 * passphrase GPG que le inyecta Coolify.
 */

function s3(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) throw new Error("S3_ENDPOINT no configurado");
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "europe-1",
    credentials: {
      accessKeyId: process.env.S3_BACKUP_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_BACKUP_SECRET_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function bucket(): string {
  const b = process.env.S3_BUCKET_BACKUPS;
  if (!b) throw new Error("S3_BUCKET_BACKUPS no configurado");
  return b;
}

export function backupsConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET_BACKUPS &&
      process.env.S3_BACKUP_ACCESS_KEY &&
      process.env.S3_BACKUP_SECRET_KEY,
  );
}

export type BackupObject = { key: string; size: number; lastModified: Date };

/** Lista los dumps disponibles (más reciente primero). */
export async function listBackups(limit = 20): Promise<BackupObject[]> {
  const prefix = process.env.S3_BACKUPS_PREFIX ?? "db/";
  const res = await s3().send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, MaxKeys: 1000 }),
  );
  const items = (res.Contents ?? [])
    .filter((o) => o.Key && o.Key.endsWith(".sql.gz.gpg"))
    .map((o) => ({ key: o.Key!, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) }))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return items.slice(0, limit);
}

export async function latestBackup(): Promise<BackupObject | null> {
  const [first] = await listBackups(1);
  return first ?? null;
}

/** URL prefirmada de descarga (por defecto 2 h — el restore corre nada más desplegar). */
export async function presignBackupUrl(key: string, expiresSeconds = 7200): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: expiresSeconds,
  });
}
