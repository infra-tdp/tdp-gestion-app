#!/usr/bin/env node
/**
 * Despliegue de TDP Gestión en Coolify por API — Coolify es EFÍMERO: las
 * variables NO se configuran en su UI, viven como Secrets/Variables del repo
 * en GitHub y las sincroniza .github/workflows/deploy.yml.
 *
 *   node scripts/coolify-deploy.mjs bootstrap  # crea el recurso (Coolify nuevo)
 *   node scripts/coolify-deploy.mjs deploy     # sincroniza envs+dominio y despliega
 *
 * Mismos endpoints que usa la propia app para los stagings
 * (src/lib/infra/coolify.ts).
 */

const API_URL = required("COOLIFY_API_URL").replace(/\/(api(\/v1)?)?\/?$/, "");
const TOKEN = required("COOLIFY_TOKEN");

/**
 * Variables de la app que se sincronizan al recurso. `from` permite renombrar:
 * GitHub Actions no deja definir envs con prefijo GITHUB_, así que el secret se
 * llama TDP_GITHUB_TOKEN y aquí se vuelca como GITHUB_TOKEN.
 */
const APP_ENVS = [
  { key: "DATABASE_URL" },
  { key: "DATABASE_CA_CERT" },
  { key: "AUTH_SECRET" },
  { key: "ADMIN_EMAIL" },
  { key: "ADMIN_PASSWORD" },
  { key: "UPCLOUD_USERNAME" },
  { key: "UPCLOUD_PASSWORD" },
  { key: "PG_CONN_STR" },
  { key: "GITHUB_TOKEN", from: "TDP_GITHUB_TOKEN" },
  { key: "GITHUB_ORG", from: "TDP_GITHUB_ORG" },
  { key: "WEB_REPO" },
  { key: "INFRA_REPO" },
  { key: "GHCR_IMAGE" },
  { key: "COOLIFY_API_URL" },
  { key: "COOLIFY_TOKEN" },
  { key: "COOLIFY_PROJECT_UUID" },
  { key: "COOLIFY_SERVER_UUID" },
  { key: "COOLIFY_ENVIRONMENT_NAME" },
  { key: "COOLIFY_GITHUB_APP_UUID" },
  { key: "S3_ENDPOINT" },
  { key: "S3_REGION" },
  { key: "S3_BUCKET_BACKUPS" },
  { key: "S3_BACKUP_ACCESS_KEY" },
  { key: "S3_BACKUP_SECRET_KEY" },
  { key: "S3_BACKUPS_PREFIX" },
  { key: "BACKUP_GPG_PASSPHRASE" },
  { key: "S3_BUCKET_MEDIA" },
  { key: "TDP_CDN_DOMAIN" },
  { key: "STAGING_DOMAIN_BASE" },
  { key: "STAGING_DOMAIN_SUFFIX" },
  { key: "STAGING_DEVBOX_HOST" },
  { key: "STAGING_DEVBOX_PORT_BASE" },
  { key: "STAGING_GIT_TOKEN" },
  { key: "STAGING_COMPOSE_LOCATION" },
  { key: "STAGING_COMPOSE_BUILD_LOCATION" },
  { key: "STAGING_DISABLE_PLUGINS" },
  { key: "CF_API_TOKEN" },
  { key: "CF_ACCOUNT_ID" },
  { key: "CF_TUNNEL_ID" },
  { key: "CF_ZONE_ID" },
  { key: "UPCLOUD_PRIVATE_NETWORK" },
  { key: "STAGING_NODE_IPS" },
  { key: "MONITOR_DEFAULTS" },
  { key: "ANTHROPIC_API_KEY" },
  { key: "ANTHROPIC_MODEL" },
  { key: "TASK_AGENT_URL" },
  { key: "TASK_AGENT_TOKEN" },
];

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[deploy] Falta la variable ${name}`);
    process.exit(1);
  }
  return value;
}

async function coolify(path, init) {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Coolify ${init?.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

async function ensureEnvironment(projectUuid, name) {
  try {
    await coolify(`/projects/${projectUuid}/environments`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("409") || msg.toLowerCase().includes("already exists")) return;
    throw err;
  }
}

async function setEnv(appUuid, key, value) {
  try {
    await coolify(`/applications/${appUuid}/envs`, {
      method: "POST",
      body: JSON.stringify({ key, value, is_preview: false }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("409") || msg.toLowerCase().includes("already")) {
      await coolify(`/applications/${appUuid}/envs`, {
        method: "PATCH",
        body: JSON.stringify({ key, value, is_preview: false }),
      });
      return;
    }
    throw err;
  }
}

async function syncEnvs(appUuid) {
  let count = 0;
  for (const { key, from } of APP_ENVS) {
    const value = process.env[from ?? key];
    if (value === undefined || value === "") continue;
    await setEnv(appUuid, key, value);
    count++;
  }
  console.log(`[deploy] ${count} variables sincronizadas`);
}

/** Dominio del servicio 'app' del compose (equivale al campo Domains de la UI). */
async function syncDomain(appUuid) {
  const domain = process.env.GESTION_DOMAIN;
  if (!domain) return;
  await coolify(`/applications/${appUuid}`, {
    method: "PATCH",
    body: JSON.stringify({ docker_compose_domains: [{ name: "app", domain: `https://${domain}` }] }),
  });
  console.log(`[deploy] Dominio: app → https://${domain}`);
}

async function bootstrap() {
  const projectUuid = required("COOLIFY_PROJECT_UUID");
  const serverUuid = required("COOLIFY_SERVER_UUID");
  const githubAppUuid = required("COOLIFY_GITHUB_APP_UUID");
  const environmentName = process.env.COOLIFY_ENVIRONMENT_NAME || "production";
  const repository = process.env.GITHUB_REPOSITORY || "infra-tdp/tdp-gestion-app";
  const branch = process.env.DEPLOY_BRANCH || "main";

  await ensureEnvironment(projectUuid, environmentName);

  const created = await coolify("/applications/private-github-app", {
    method: "POST",
    body: JSON.stringify({
      project_uuid: projectUuid,
      server_uuid: serverUuid,
      environment_name: environmentName,
      github_app_uuid: githubAppUuid,
      git_repository: repository,
      git_branch: branch,
      build_pack: "dockercompose",
      docker_compose_location: "/docker-compose.yaml",
      name: "tdp-gestion",
      description: "TDP Gestión — CRM interno",
      instant_deploy: false,
      is_auto_deploy_enabled: true,
    }),
  });

  const uuid = created?.uuid;
  if (!uuid) throw new Error(`Coolify no devolvió uuid: ${JSON.stringify(created)}`);
  console.log(`[deploy] Recurso creado: ${uuid}`);
  console.log(`[deploy] Guarda COOLIFY_APP_UUID=${uuid} como variable del repo en GitHub.`);

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `app_uuid=${uuid}\n`);
  }

  await syncEnvs(uuid);
  await syncDomain(uuid);
  await coolify(`/deploy?uuid=${uuid}&force=true`, { method: "POST" });
  console.log("[deploy] Deploy inicial lanzado");
}

async function deploy() {
  const uuid = required("COOLIFY_APP_UUID");
  await syncEnvs(uuid);
  await syncDomain(uuid);
  await coolify(`/deploy?uuid=${uuid}&force=true`, { method: "POST" });
  console.log("[deploy] Deploy lanzado");
}

const command = process.argv[2];
if (command === "bootstrap") await bootstrap();
else if (command === "deploy") await deploy();
else {
  console.error("Uso: node scripts/coolify-deploy.mjs <bootstrap|deploy>");
  process.exit(1);
}
