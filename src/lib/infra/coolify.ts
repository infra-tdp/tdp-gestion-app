import "server-only";

/**
 * Cliente de la API de Coolify v4 (https://coolify.io/docs/api).
 * La app crea/destruye los stacks de staging como recursos de Coolify y los
 * despliega igual que hace el CI de la web (POST /api/v1/deploy).
 *
 *   COOLIFY_API_URL  origen de la API de Coolify, p. ej. http://10.0.0.16:8000
 *                    ⚠ NO usar COOLIFY_URL: es una variable PREDEFINIDA de Coolify
 *                    que él mismo inyecta con la URL de la propia app, así que
 *                    cualquier valor que pongas ahí lo pisa Coolify.
 *   COOLIFY_TOKEN    API token (Keys & Tokens → API tokens, con permisos de escritura)
 */

function baseUrl(): string {
  const url = process.env.COOLIFY_API_URL;
  if (!url) throw new Error("COOLIFY_API_URL no configurado");
  // Tolerante: el código añade /api/v1, así que quitamos un /api/v1 o /api final
  // (error típico) y la barra de cierre. COOLIFY_API_URL debe ser solo el origen,
  // p. ej. http://10.0.0.16:8000
  return url.replace(/\/+$/, "").replace(/\/api(?:\/v1)?$/i, "");
}

async function coolify<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.COOLIFY_TOKEN;
  if (!token) throw new Error("COOLIFY_TOKEN no configurado");
  const res = await fetch(`${baseUrl()}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Coolify ${init?.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export function coolifyConfigured(): boolean {
  return Boolean(process.env.COOLIFY_API_URL && process.env.COOLIFY_TOKEN);
}

type CoolifyServer = { uuid: string; name: string; ip?: string; is_coolify_host?: boolean };
type CoolifyProject = { uuid: string; name: string; description?: string };
type CoolifyResource = { uuid: string; name: string; type?: string; status?: string };
type CoolifyGithubApp = {
  uuid: string;
  name: string;
  organization?: string | null;
  is_public?: boolean;
  installation_id?: number | null;
};

/**
 * Normaliza la respuesta de un endpoint de lista de Coolify: acepta tanto un
 * array plano (`[...]`) como envuelto (`{ data: [...] }`, que usan algunas
 * versiones/paginación). Si no es ninguna de las dos (p. ej. `coolify()`
 * devolvió texto porque el cuerpo era HTML de un proxy/login que respondió 200),
 * lanza un error con una muestra de lo recibido para poder diagnosticarlo.
 */
function unwrapList<T>(payload: unknown, label: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as T[];
  }
  // Caso típico: COOLIFY_API_URL apunta a una web (la propia app u otra) en vez
  // de a la API de Coolify → recibimos una página HTML, no JSON. Lo detectamos
  // para dar una pista accionable en lugar de un volcado opaco.
  if (typeof payload === "string" && /^\s*<(?:!doctype|html)/i.test(payload)) {
    throw new Error(
      `${label}: COOLIFY_API_URL apunta a una página web (HTML), no a la API de Coolify. ` +
        `Debe ser el origen del panel de Coolify SIN /api/v1 (p. ej. http://10.0.0.16:8000). ` +
        `OJO: no la llames COOLIFY_URL — Coolify reserva ese nombre y lo pisa con la URL de la app.`,
    );
  }
  const snippet =
    typeof payload === "string"
      ? payload.slice(0, 140)
      : JSON.stringify(payload)?.slice(0, 140) ?? String(payload);
  throw new Error(
    `${label} no devolvió una lista (revisa COOLIFY_API_URL, que apunte a la API y que el token tenga permiso). Respuesta: ${snippet}`,
  );
}

export async function listServersCoolify(): Promise<
  { uuid: string; name: string; ip: string; isCoolifyHost: boolean }[]
> {
  const servers = unwrapList<CoolifyServer>(await coolify("/servers"), "GET /servers");
  return servers.map((s) => ({
    uuid: s.uuid,
    name: s.name,
    ip: s.ip ?? "",
    isCoolifyHost: Boolean(s.is_coolify_host),
  }));
}

/** Proyectos de Coolify donde alojar el recurso de staging. */
export async function listProjects(): Promise<{ uuid: string; name: string; description: string }[]> {
  const projects = unwrapList<CoolifyProject>(await coolify("/projects"), "GET /projects");
  return projects.map((p) => ({ uuid: p.uuid, name: p.name, description: p.description ?? "" }));
}

/** GitHub Apps (Sources) registradas en Coolify. */
export async function listGithubApps(): Promise<
  { uuid: string; name: string; organization: string; isPublic: boolean; installed: boolean }[]
> {
  const apps = unwrapList<CoolifyGithubApp>(await coolify("/github-apps"), "GET /github-apps");
  return apps.map((a) => ({
    uuid: a.uuid,
    name: a.name,
    organization: a.organization ?? "",
    isPublic: Boolean(a.is_public),
    installed: Boolean(a.installation_id),
  }));
}

/**
 * Resuelve el UUID de la GitHub App con la que Coolify clonará el repo privado:
 *  1. COOLIFY_GITHUB_APP_UUID si está definido (override explícito).
 *  2. si no, se descubre por la API. Solo sirven las Apps INSTALADAS (tienen
 *     installation_id) — se descarta la fuente pública por defecto ("Public
 *     GitHub"), que no puede clonar repos privados. Si queda una, esa; si quedan
 *     varias, se desempata por GITHUB_ORG y, si no, error con la lista.
 * En el caso habitual (una sola GitHub App instalada) no hay que configurar nada.
 */
export async function resolveGithubAppUuid(): Promise<string> {
  const explicit = process.env.COOLIFY_GITHUB_APP_UUID;
  if (explicit) return explicit;
  const apps = await listGithubApps();
  if (apps.length === 0) {
    throw new Error(
      "No hay ninguna GitHub App en Coolify (Sources → GitHub App). Créala o define COOLIFY_GITHUB_APP_UUID.",
    );
  }
  // Solo GitHub Apps instaladas y no públicas pueden clonar el repo privado.
  const usable = apps.filter((a) => a.installed && !a.isPublic);
  const pool = usable.length > 0 ? usable : apps;
  if (pool.length === 1) return pool[0].uuid;
  const org = (process.env.GITHUB_ORG ?? "infra-tdp").toLowerCase();
  const match = pool.find((a) => a.organization.toLowerCase() === org);
  if (match) return match.uuid;
  throw new Error(
    `Hay ${pool.length} GitHub Apps instalables en Coolify y no se pudo elegir una por la organización "${org}". ` +
      `Define COOLIFY_GITHUB_APP_UUID con una de: ${pool.map((a) => `${a.name} (${a.uuid})`).join(", ")}.`,
  );
}

/** Recursos (apps/BDs/servicios) desplegados en un servidor. */
export async function listServerResources(serverUuid: string): Promise<CoolifyResource[]> {
  return unwrapList<CoolifyResource>(
    await coolify(`/servers/${serverUuid}/resources`),
    "GET /servers/{uuid}/resources",
  );
}

export type ServerLoad = {
  uuid: string;
  name: string;
  ip: string;
  /** Nº de recursos desplegados en el servidor (menos = más libre). */
  count: number;
  /** true en el servidor con menos recursos (sugerido por defecto). */
  recommended: boolean;
};

/**
 * Lista los servidores con su carga (nº de recursos) para poder sugerir el más
 * libre al desplegar un staging. Si un servidor no responde a /resources se le
 * asigna Infinity para no recomendarlo. El de menor carga queda marcado como
 * recommended (empates → el primero por nombre, estable).
 *
 * Se excluye el host de control de Coolify (is_coolify_host) — no queremos
 * desplegar stagings donde corre el propio Coolify. Si por alguna razón fuera el
 * único servidor, no se filtra (para no dejar la lista vacía). Se puede forzar su
 * inclusión con STAGING_INCLUDE_COOLIFY_HOST=1.
 */
export async function listServersWithLoad(): Promise<ServerLoad[]> {
  const all = await listServersCoolify();
  const includeHost = ["1", "true"].includes(process.env.STAGING_INCLUDE_COOLIFY_HOST ?? "");
  const deployable = all.filter((s) => !s.isCoolifyHost);
  // Excluimos el host de control salvo que sea el único servidor o se fuerce.
  const servers = includeHost || deployable.length === 0 ? all : deployable;
  const loaded = await Promise.all(
    servers.map(async (s) => {
      let count = Number.POSITIVE_INFINITY;
      try {
        const resources = await listServerResources(s.uuid);
        count = Array.isArray(resources) ? resources.length : 0;
      } catch {
        // servidor inalcanzable / sin permiso → no se recomienda
      }
      return { uuid: s.uuid, name: s.name, ip: s.ip, count };
    }),
  );
  loaded.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
  const best = loaded.find((s) => Number.isFinite(s.count));
  return loaded.map((s) => ({
    ...s,
    count: Number.isFinite(s.count) ? s.count : -1, // -1 = desconocido (se muestra “?”)
    recommended: best ? s.uuid === best.uuid : false,
  }));
}

/**
 * Asegura que el proyecto tenga el environment indicado (por defecto los
 * proyectos de Coolify solo traen "production"). Idempotente: si ya existe
 * (409), no falla. Evita el 404 "Environment not found" al crear la app.
 */
export async function ensureEnvironment(projectUuid: string, name: string): Promise<void> {
  try {
    await coolify(`/projects/${projectUuid}/environments`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // 409 / "already exists" → el environment ya está, seguimos.
    if (msg.includes("409") || msg.toLowerCase().includes("already exists")) return;
    throw err;
  }
}

export async function healthcheck(): Promise<boolean> {
  try {
    const token = process.env.COOLIFY_TOKEN;
    const res = await fetch(`${baseUrl()}/api/health`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Crea una aplicación Docker Compose desde el repo privado de la web usando la
 * GitHub App ya configurada en Coolify (la misma con la que se despliega prod).
 * El compose de staging (docker-compose.staging.yaml) vive en el repo, así que
 * los montajes de nginx funcionan igual que en producción.
 */
export async function createStagingApp(params: {
  name: string;
  branch: string;
  description?: string;
  /** Ruta del compose en el repo. Por defecto STAGING_COMPOSE_LOCATION. */
  composeLocation?: string;
  /** Servidor de Coolify donde desplegar. Por defecto COOLIFY_SERVER_UUID. */
  serverUuid?: string;
  /** Proyecto de Coolify donde alojar el recurso. Por defecto COOLIFY_PROJECT_UUID. */
  projectUuid?: string;
}): Promise<{ uuid: string }> {
  const projectUuid = params.projectUuid || process.env.COOLIFY_PROJECT_UUID;
  const serverUuid = params.serverUuid || process.env.COOLIFY_SERVER_UUID;
  const repository = process.env.STAGING_GIT_REPOSITORY ?? "infra-tdp/tdp-app-wordpress-prod";
  const composeLocation =
    params.composeLocation ?? process.env.STAGING_COMPOSE_LOCATION ?? "/docker-compose.staging.yaml";
  if (!projectUuid || !serverUuid) {
    throw new Error(
      "Falta el proyecto o el servidor de Coolify (elígelos en el formulario o define COOLIFY_PROJECT_UUID / COOLIFY_SERVER_UUID)",
    );
  }
  // GitHub App: se resuelve sola (la de la org / la única) salvo override por env.
  const githubAppUuid = await resolveGithubAppUuid();
  // Environment: nos aseguramos de que exista en el proyecto (idempotente) para
  // no chocar con el 404 "Environment not found".
  const environmentName = process.env.COOLIFY_ENVIRONMENT_NAME ?? "staging";
  await ensureEnvironment(projectUuid, environmentName);
  return coolify<{ uuid: string }>("/applications/private-github-app", {
    method: "POST",
    body: JSON.stringify({
      project_uuid: projectUuid,
      server_uuid: serverUuid,
      environment_name: environmentName,
      github_app_uuid: githubAppUuid,
      git_repository: repository,
      git_branch: params.branch,
      build_pack: "dockercompose",
      docker_compose_location: composeLocation,
      name: params.name,
      description: params.description ?? "Entorno staging efímero (TDP Gestión)",
      instant_deploy: false,
      // Desactivamos el auto-deploy por webhook: el push que crea la rama
      // staging dispararía un build extra además del que lanzamos por API.
      // Los deploys los orquesta la app (deploy inicial + redeploys).
      is_auto_deploy_enabled: false,
    }),
  });
}

/** Añade/actualiza una variable de entorno del recurso. */
export async function setAppEnv(appUuid: string, key: string, value: string): Promise<void> {
  try {
    await coolify(`/applications/${appUuid}/envs`, {
      method: "POST",
      body: JSON.stringify({ key, value, is_preview: false }),
    });
  } catch (err) {
    // Si ya existe (409/400), la actualizamos
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

export async function setAppEnvBulk(appUuid: string, envs: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(envs)) {
    await setAppEnv(appUuid, key, value);
  }
}

/**
 * Fija el dominio público del entorno (lo enruta Traefik en el server de Coolify).
 * Para apps Docker Compose no se puede usar el campo `domains` — hay que asignar
 * el dominio a un servicio concreto vía `docker_compose_domains`. El servicio
 * web del compose de staging es `nginx` (configurable con STAGING_DOMAIN_SERVICE).
 */
export async function setAppDomain(
  appUuid: string,
  fqdn: string,
  serviceName = process.env.STAGING_DOMAIN_SERVICE ?? "nginx",
): Promise<void> {
  await coolify(`/applications/${appUuid}`, {
    method: "PATCH",
    body: JSON.stringify({ docker_compose_domains: [{ name: serviceName, domain: fqdn }] }),
  });
}

export async function deployApp(appUuid: string): Promise<void> {
  await coolify(`/deploy?uuid=${appUuid}&force=true`, { method: "POST" });
}

export async function getApp(appUuid: string): Promise<Record<string, unknown>> {
  return coolify(`/applications/${appUuid}`);
}

/**
 * Espera a que Coolify haya clonado y parseado el compose (docker_compose_raw
 * deja de estar vacío). Necesario antes de fijar `docker_compose_domains`, que
 * si no falla con "Cannot set docker_compose_domains without docker_compose_raw".
 * Devuelve true si cargó dentro del timeout.
 */
export async function waitForComposeLoaded(appUuid: string, timeoutMs = 180000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const app = await getApp(appUuid);
      const raw = app["docker_compose_raw"] ?? app["docker_compose"];
      if (typeof raw === "string" && raw.trim().length > 0) return true;
    } catch {
      // reintenta hasta el timeout
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

export async function deleteApp(appUuid: string): Promise<void> {
  await coolify(
    `/applications/${appUuid}?delete_configurations=true&delete_volumes=true&docker_cleanup=true&delete_connected_networks=true`,
    { method: "DELETE" },
  );
}

/** Redeploya cualquier recurso por uuid — igual que el workflow build.yml de la web. */
export async function redeployByUuid(uuid: string): Promise<void> {
  await coolify(`/deploy?uuid=${uuid}&force=true`, { method: "POST" });
}
