import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { latestBackup, presignBackupUrl } from "@/lib/infra/backups";
import {
  createStagingApp,
  deleteApp,
  deployApp,
  listServersCoolify,
  redeployByUuid,
  setAppDomain,
  setAppEnvBulk,
  waitForComposeLoaded,
} from "@/lib/infra/coolify";
import {
  cloudflareRoutingConfigured,
  removeStagingRoute,
  upsertStagingRoute,
} from "@/lib/infra/cloudflare";
import {
  findServerUuidByIp,
  getServerPrivateIp,
  isPrivateIpv4,
  upcloudConfigured,
} from "@/lib/infra/upcloud";
import { createBranch, deleteBranch } from "@/lib/infra/github";

/**
 * Orquestador de entornos staging efímeros de la web tallerdelpatinete.
 *
 * Pipeline de provisión (cada paso queda registrado en staging_events):
 *   1. branch   — crea staging/<slug> desde main en el repo de la web
 *   2. backup   — localiza el último dump GPG en S3 y genera URL prefirmada
 *   3. coolify  — crea el recurso Docker Compose (docker-compose.staging.yaml
 *                 del repo, en la rama del entorno) vía la GitHub App de Coolify
 *   4. envs     — inyecta variables: imagen ghcr elegida, MySQL temporal,
 *                 salts nuevos, URL del dump, claves SSH del dev, puerto devbox
 *   5. deploy   — dispara el deploy; el servicio db-restore restaura el backup
 *                 y el devbox queda accesible por SSH/SFTP con la rama clonada
 *
 * El compose de staging vive en el repo de la web (se añade una única vez);
 * así los montajes de nginx funcionan exactamente igual que en producción.
 */

const DEVBOX_PORT_BASE = Number(process.env.STAGING_DEVBOX_PORT_BASE ?? 22000);

function genSecret(bytes = 48): string {
  return randomBytes(bytes).toString("base64");
}

async function logStep(envId: number, step: string, ok: boolean, message?: string): Promise<void> {
  await db.insert(schema.stagingEvents).values({ envId, step, ok, message });
}

/**
 * IP privada del nodo (la que alcanza cloudflared) para enrutar el entorno,
 * resuelta DINÁMICAMENTE a partir del servidor de Coolify elegido — así, al
 * añadir un nodo nuevo no hay que tocar ninguna variable:
 *   1. STAGING_NODE_IPS (JSON serverUuid→ip): override manual opcional.
 *   2. IP que reporta Coolify del servidor: si ya es privada (10.x), se usa.
 *   3. si es pública, se correlaciona en UpCloud (por esa IP) y se lee la IP de
 *      su interfaz privada/SDN.
 *   4. último recurso: la IP pública de Coolify.
 */
async function resolveNodeIp(serverUuid: string | null): Promise<string | null> {
  const uuid = serverUuid || process.env.COOLIFY_SERVER_UUID || "";

  // 1. Override manual (normalmente innecesario)
  const map = process.env.STAGING_NODE_IPS;
  if (map && uuid) {
    try {
      const m = JSON.parse(map) as Record<string, string>;
      if (m[uuid]) return m[uuid];
    } catch {
      // STAGING_NODE_IPS mal formado — seguimos con la resolución dinámica
    }
  }

  // 2. IP que reporta Coolify para ese servidor
  let coolifyIp = "";
  try {
    const servers = await listServersCoolify();
    coolifyIp = servers.find((x) => x.uuid === uuid)?.ip ?? "";
  } catch {
    // sin acceso a /servers
  }
  if (!coolifyIp || coolifyIp === "host.docker.internal") return null;
  if (isPrivateIpv4(coolifyIp)) return coolifyIp;

  // 3. IP pública → IP privada vía UpCloud
  if (upcloudConfigured()) {
    try {
      const upUuid = await findServerUuidByIp(coolifyIp);
      if (upUuid) {
        const priv = await getServerPrivateIp(upUuid, process.env.UPCLOUD_PRIVATE_NETWORK);
        if (priv) return priv;
      }
    } catch {
      // UpCloud no respondió — caemos a la IP pública
    }
  }

  // 4. Sin privada localizada: la pública como último recurso
  return coolifyIp;
}

async function setStatus(
  envId: number,
  status: (typeof schema.stagingEnvs.$inferSelect)["status"],
  extra?: Partial<typeof schema.stagingEnvs.$inferInsert>,
): Promise<void> {
  await db
    .update(schema.stagingEnvs)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(schema.stagingEnvs.id, envId));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/** Crea la solicitud y lanza la provisión en background. Devuelve el id. */
export async function requestStagingEnv(params: {
  userId: number;
  userName: string;
  buildFromBranch: boolean;
  imageTag: string;
  /** Clave S3 del backup elegido; vacío = el más reciente (se resuelve al provisionar) */
  backupKey?: string;
  /** UUID del servidor de Coolify elegido; vacío = COOLIFY_SERVER_UUID por defecto */
  serverUuid?: string;
  /** UUID del proyecto de Coolify elegido; vacío = COOLIFY_PROJECT_UUID por defecto */
  projectUuid?: string;
  purpose?: string;
  ttlHours: number;
}): Promise<number> {
  const suffix = randomBytes(2).toString("hex");
  const slug = `${slugify(params.userName) || "dev"}-${suffix}`;
  const branch = `staging/${slug}`;

  const [row] = await db
    .insert(schema.stagingEnvs)
    .values({
      slug,
      requestedBy: params.userId,
      buildFromBranch: params.buildFromBranch,
      imageTag: params.imageTag || "latest",
      backupKey: params.backupKey || null,
      serverUuid: params.serverUuid || null,
      projectUuid: params.projectUuid || null,
      branch,
      status: "pending",
      devboxPort: DEVBOX_PORT_BASE, // se recalcula con el id real justo después
      expiresAt: new Date(Date.now() + params.ttlHours * 3600 * 1000),
    })
    .returning({ id: schema.stagingEnvs.id });

  const devboxPort = DEVBOX_PORT_BASE + (row.id % 2000);
  await db
    .update(schema.stagingEnvs)
    .set({ devboxPort })
    .where(eq(schema.stagingEnvs.id, row.id));

  void provision(row.id).catch(async (err) => {
    await setStatus(row.id, "error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  });

  return row.id;
}

async function provision(envId: number): Promise<void> {
  const [env] = await db.select().from(schema.stagingEnvs).where(eq(schema.stagingEnvs.id, envId));
  if (!env) throw new Error("Entorno no encontrado");
  await setStatus(envId, "provisioning");

  try {
    // 1. Rama desde main
    await createBranch(env.branch);
    await logStep(envId, "branch", true, `Rama ${env.branch} creada desde main`);

    // 2. Backup elegido (o el más reciente) + URL prefirmada
    const backup = env.backupKey
      ? { key: env.backupKey, size: 0, lastModified: new Date() }
      : await latestBackup();
    if (!backup) throw new Error("No hay backups .sql.gz.gpg en el bucket");
    const dumpUrl = await presignBackupUrl(backup.key);
    await db
      .update(schema.stagingEnvs)
      .set({ backupKey: backup.key })
      .where(eq(schema.stagingEnvs.id, envId));
    await logStep(
      envId,
      "backup",
      true,
      env.backupKey ? `Backup elegido: ${backup.key}` : `Último backup: ${backup.key}`,
    );

    // 3. Claves SSH del solicitante para el devbox
    const keys = await db
      .select({ publicKey: schema.sshKeys.publicKey })
      .from(schema.sshKeys)
      .where(eq(schema.sshKeys.userId, env.requestedBy));
    const publicKeys = keys.map((k) => k.publicKey.trim()).join("\n");
    if (!publicKeys) {
      await logStep(envId, "ssh-keys", false, "El dev no tiene claves SSH guardadas — el devbox no permitirá login");
    } else {
      await logStep(envId, "ssh-keys", true, `${keys.length} clave(s) SSH inyectadas en el devbox`);
    }

    // 4. Recurso en Coolify. Compose según el modo: build desde la rama (Dockerfile
    //    del repo) o imagen ghcr inmutable.
    const composeLocation = env.buildFromBranch
      ? process.env.STAGING_COMPOSE_BUILD_LOCATION ?? "/docker-compose.staging-build.yaml"
      : process.env.STAGING_COMPOSE_LOCATION ?? "/docker-compose.staging.yaml";
    const modeLabel = env.buildFromBranch ? `build desde ${env.branch}` : `imagen :${env.imageTag}`;
    const app = await createStagingApp({
      name: `staging-${env.slug}`,
      branch: env.branch,
      description: `Staging efímero ${env.slug} · ${modeLabel} · TDP Gestión`,
      composeLocation,
      serverUuid: env.serverUuid ?? undefined,
      projectUuid: env.projectUuid ?? undefined,
    });
    await db
      .update(schema.stagingEnvs)
      .set({ coolifyAppUuid: app.uuid })
      .where(eq(schema.stagingEnvs.id, envId));
    const targetLabel = env.serverUuid ? ` en servidor ${env.serverUuid}` : "";
    await logStep(envId, "coolify", true, `Recurso creado en Coolify (${app.uuid})${targetLabel}`);

    // 5. Variables de entorno del stack de staging
    const image = `${process.env.GHCR_IMAGE ?? "ghcr.io/infra-tdp/tdp-app-wordpress-prod"}:${env.imageTag}`;
    // Subdominio de UN SOLO nivel (label con guiones) para que lo cubra el
    // certificado Universal SSL gratuito de Cloudflare (*.tallerdelpatinete.es).
    // Un segundo nivel (p. ej. <slug>.staging.tallerdelpatinete.es) exigiría
    // Advanced Certificate Manager (de pago). STAGING_DOMAIN_BASE = el apex.
    const domainApex = process.env.STAGING_DOMAIN_BASE ?? "tallerdelpatinete.es";
    const domainLabelSuffix = process.env.STAGING_DOMAIN_SUFFIX ?? "-staging";
    const fqdn = `${env.slug}${domainLabelSuffix}.${domainApex}`;
    const dbPass = genSecret(18).replace(/[+/=]/g, "x");

    const envs: Record<string, string> = {
      WP_IMAGE: image,
      // MySQL temporal (servicio del propio compose)
      DB_HOST: "mysql",
      DB_PORT: "3306",
      DB_NAME: "wordpress",
      DB_USER: "wordpress",
      DB_PASS: dbPass,
      DB_ROOT_PASS: genSecret(18).replace(/[+/=]/g, "x"),
      DB_TABLE_PREFIX: process.env.STAGING_DB_TABLE_PREFIX ?? "wp_",
      // Restore del backup
      DUMP_URL: dumpUrl,
      BACKUP_GPG_PASSPHRASE: process.env.BACKUP_GPG_PASSPHRASE ?? "",
      // Salts nuevos (BD propia → pueden ser nuevos)
      AUTH_KEY: genSecret(),
      SECURE_AUTH_KEY: genSecret(),
      LOGGED_IN_KEY: genSecret(),
      NONCE_KEY: genSecret(),
      AUTH_SALT: genSecret(),
      SECURE_AUTH_SALT: genSecret(),
      LOGGED_IN_SALT: genSecret(),
      NONCE_SALT: genSecret(),
      // URLs / entorno
      TDP_DOMAIN: fqdn,
      WP_ENVIRONMENT_TYPE: "staging",
      WP_DYNAMIC_HOST: "true",
      // Media: las imágenes existentes ya están en la BD con URL del CDN → cargan
      // del CDN en solo-lectura (idéntico a prod). Desactivamos el plugin de offload
      // en staging (WP_DISABLE_OFFLOAD + STAGING_DISABLE_PLUGINS) para que las SUBIDAS
      // NUEVAS del dev se guarden en el disco local del entorno (mueren al destruirlo)
      // y NUNCA toquen el bucket de prod. No se pasan claves de escritura de media.
      TDP_CDN_DOMAIN: process.env.TDP_CDN_DOMAIN ?? "",
      WP_DISABLE_OFFLOAD: "1",
      STAGING_DISABLE_PLUGINS: process.env.STAGING_DISABLE_PLUGINS ?? "",
      // Devbox
      DEVBOX_PORT: String(env.devboxPort ?? DEVBOX_PORT_BASE),
      // Las claves van en base64 (una sola línea): Coolify escribe cada variable
      // como una línea del .env y un valor multilínea (varias claves con \n)
      // rompía el parseo. El devbox-init lo decodifica.
      DEVBOX_PUBLIC_KEYS_B64: publicKeys ? Buffer.from(publicKeys, "utf8").toString("base64") : "",
      STAGING_BRANCH: env.branch,
      STAGING_GIT_REPO: `${process.env.GITHUB_ORG ?? "infra-tdp"}/${process.env.WEB_REPO ?? "tdp-app-wordpress-prod"}`,
      STAGING_GIT_TOKEN: process.env.STAGING_GIT_TOKEN ?? "",
    };
    await setAppEnvBulk(app.uuid, envs);
    await logStep(envId, "envs", true, `${Object.keys(envs).length} variables configuradas`);

    // 6. Deploy (PRIMERO): Coolify clona y parsea el compose. El dominio de una
    //    app compose (docker_compose_domains) no se puede fijar hasta que el
    //    compose está parseado, así que va después.
    await deployApp(app.uuid);
    await logStep(envId, "deploy", true, "Deploy lanzado — Coolify clona/construye/arranca; db-restore restaura el backup");

    // 7. Dominio del entorno: esperamos a que el compose cargue, lo fijamos y
    //    redeployamos para que Traefik enrute el nuevo host. Requiere wildcard
    //    DNS/túnel hacia el server de Coolify.
    try {
      const loaded = await waitForComposeLoaded(app.uuid);
      if (!loaded) throw new Error("Coolify tardó demasiado en cargar el compose");
      await setAppDomain(app.uuid, `https://${fqdn}`);
      await redeployByUuid(app.uuid);
      await logStep(envId, "domain", true, `https://${fqdn} (aplicado con redeploy)`);
    } catch (err) {
      await logStep(
        envId,
        "domain",
        false,
        `No se pudo fijar el dominio automáticamente: ${err instanceof Error ? err.message : err}. Cuando termine el primer deploy, pulsa "Redesplegar".`,
      );
    }

    // 8. Ruta pública dinámica: Cloudflare Tunnel → Traefik del nodo donde vive
    //    el entorno (la app elige nodo, así que la ruta es por-entorno).
    if (cloudflareRoutingConfigured()) {
      try {
        const nodeIp = await resolveNodeIp(env.serverUuid);
        if (!nodeIp) {
          throw new Error("no se pudo resolver la IP del nodo (define STAGING_NODE_IPS o revisa Coolify)");
        }
        await upsertStagingRoute(fqdn, nodeIp);
        await logStep(envId, "route", true, `${fqdn} → ${nodeIp}:80 (Cloudflare Tunnel)`);
      } catch (err) {
        await logStep(
          envId,
          "route",
          false,
          `No se pudo crear la ruta en Cloudflare: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await setStatus(envId, "active", { url: `https://${fqdn}` });

    await db.insert(schema.notifications).values({
      userId: env.requestedBy,
      type: "staging.ready",
      title: `🟢 Staging ${env.slug} desplegándose`,
      body: `URL: https://${fqdn} · SSH devbox: puerto ${env.devboxPort} · Rama: ${env.branch} · Imagen: :${env.imageTag}`,
      meta: { envId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logStep(envId, "error", false, message);
    await setStatus(envId, "error", { errorMessage: message });
    throw err;
  }
}

/**
 * Redespliega el entorno (Coolify vuelve a construir/desplegar la rama). Se usa
 * tras `git push` en el devbox para ver los cambios en vivo antes de abrir la PR.
 *
 * Además REINTENTA fijar el dominio: si en el primer deploy Coolify tardó en
 * parsear el compose y el paso `domain` falló, aquí ya está cargado, así que
 * pulsar "Redesplegar" lo deja enrutado. Idempotente y no fatal.
 */
export async function redeployStagingEnv(envId: number): Promise<void> {
  const [env] = await db.select().from(schema.stagingEnvs).where(eq(schema.stagingEnvs.id, envId));
  if (!env) throw new Error("Entorno no encontrado");
  if (!env.coolifyAppUuid) throw new Error("El entorno aún no tiene recurso en Coolify");
  if (env.url) {
    try {
      await setAppDomain(env.coolifyAppUuid, env.url);
      await logStep(envId, "domain", true, `${env.url} (fijado en redeploy)`);
    } catch (err) {
      await logStep(envId, "domain", false, `Dominio no fijado: ${err instanceof Error ? err.message : err}`);
    }
  }
  await deployApp(env.coolifyAppUuid);
  await logStep(envId, "redeploy", true, "Redeploy lanzado (rebuild de la rama + dominio)");
}

/** Destruye el entorno: borra el recurso de Coolify y (sin PR abierta) la rama. */
export async function destroyStagingEnv(envId: number): Promise<void> {
  const [env] = await db.select().from(schema.stagingEnvs).where(eq(schema.stagingEnvs.id, envId));
  if (!env) throw new Error("Entorno no encontrado");
  await setStatus(envId, "destroying");
  try {
    // Quita la ruta de Cloudflare (ingress del túnel + DNS) del entorno.
    if (cloudflareRoutingConfigured() && env.url) {
      try {
        await removeStagingRoute(env.url.replace(/^https?:\/\//, ""));
        await logStep(envId, "route-delete", true, "Ruta de Cloudflare eliminada");
      } catch (err) {
        await logStep(envId, "route-delete", false, `Ruta CF no eliminada: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (env.coolifyAppUuid) {
      await deleteApp(env.coolifyAppUuid);
      await logStep(envId, "coolify-delete", true, "Recurso de Coolify eliminado (con volúmenes)");
    }
    if (!env.prNumber) {
      await deleteBranch(env.branch);
      await logStep(envId, "branch-delete", true, `Rama ${env.branch} eliminada (sin PR abierta)`);
    } else {
      await logStep(envId, "branch-keep", true, `Rama conservada — PR #${env.prNumber} abierta`);
    }
    await setStatus(envId, "destroyed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logStep(envId, "error", false, message);
    await setStatus(envId, "error", { errorMessage: message });
    throw err;
  }
}

/** Sweeper de caducidad: destruye entornos activos cuyo TTL ha vencido. */
export async function expireStagingEnvs(): Promise<void> {
  const expired = await db
    .select({ id: schema.stagingEnvs.id, slug: schema.stagingEnvs.slug })
    .from(schema.stagingEnvs)
    .where(
      and(
        inArray(schema.stagingEnvs.status, ["active", "error"]),
        lt(schema.stagingEnvs.expiresAt, new Date()),
      ),
    );
  for (const env of expired) {
    try {
      await destroyStagingEnv(env.id);
      await db.insert(schema.notifications).values({
        type: "staging.expired",
        title: `⏳ Staging ${env.slug} caducado y destruido`,
        meta: { envId: env.id },
      });
    } catch {
      // el error queda registrado en staging_events; se reintenta en el siguiente tick
    }
  }
}
