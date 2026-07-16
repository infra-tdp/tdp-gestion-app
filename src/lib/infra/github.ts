import "server-only";

/**
 * Cliente GitHub para el flujo de staging/PR:
 *  - crear la rama del entorno desde main
 *  - listar versiones (tags) de la imagen en ghcr
 *  - abrir la PR y gestionarla (merge solo con permiso pr.merge y nunca el autor)
 *
 *   GITHUB_TOKEN  PAT/fine-grained con: contents(rw) + pull_requests(rw) del repo
 *                 de la web y read:packages de la organización.
 */

const API = "https://api.github.com";

function org(): string {
  return process.env.GITHUB_ORG ?? "infra-tdp";
}
export function webRepo(): string {
  return process.env.WEB_REPO ?? "tdp-app-wordpress-prod";
}
export function infraRepo(): string {
  return process.env.INFRA_REPO ?? "tdp-tienda-infra";
}

async function gh<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN no configurado");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

/** Contenido (texto) de un fichero del repo en una rama/ref concreta. */
export async function getFileContent(path: string, ref: string, repo = webRepo()): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN no configurado");
  const clean = path.replace(/^\/+/, "");
  const res = await fetch(
    `${API}/repos/${org()}/${repo}/contents/${clean}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub GET contents/${clean}@${ref} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.text();
}

/** SHA actual de main del repo de la web. */
export async function getMainSha(repo = webRepo()): Promise<string> {
  const data = await gh<{ object: { sha: string } }>(`/repos/${org()}/${repo}/git/ref/heads/main`);
  return data.object.sha;
}

/** Crea una rama desde main. Si ya existe, no falla (idempotente). */
export async function createBranch(branch: string, repo = webRepo()): Promise<void> {
  const sha = await getMainSha(repo);
  try {
    await gh(`/repos/${org()}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!msg.includes("422")) throw err; // 422 = ya existe
  }
}

export async function deleteBranch(branch: string, repo = webRepo()): Promise<void> {
  try {
    await gh(`/repos/${org()}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "DELETE" });
  } catch {
    // rama ya borrada — no es un error del flujo
  }
}

/** Tags disponibles de la imagen en ghcr (paquete container de la organización). */
export async function listGhcrTags(): Promise<{ tag: string; createdAt: string }[]> {
  const pkg = process.env.GHCR_PACKAGE ?? webRepo();
  type Version = { created_at: string; metadata?: { container?: { tags?: string[] } } };
  const versions = await gh<Version[]>(
    `/orgs/${org()}/packages/container/${encodeURIComponent(pkg)}/versions?per_page=50`,
  );
  const out: { tag: string; createdAt: string }[] = [];
  for (const v of versions) {
    for (const tag of v.metadata?.container?.tags ?? []) {
      out.push({ tag, createdAt: v.created_at });
    }
  }
  // latest primero, después el resto por fecha desc
  out.sort((a, b) => (a.tag === "latest" ? -1 : b.tag === "latest" ? 1 : b.createdAt.localeCompare(a.createdAt)));
  return out;
}

export type PullRequest = {
  number: number;
  html_url: string;
  state: string;
  merged: boolean;
  title: string;
  user: { login: string };
  head: { ref: string };
  mergeable_state?: string;
};

export async function createPullRequest(params: {
  branch: string;
  title: string;
  body: string;
  repo?: string;
}): Promise<PullRequest> {
  return gh<PullRequest>(`/repos/${org()}/${params.repo ?? webRepo()}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: params.title,
      head: params.branch,
      base: "main",
      body: params.body,
      draft: false,
    }),
  });
}

export async function getPullRequest(number: number, repo = webRepo()): Promise<PullRequest> {
  return gh<PullRequest>(`/repos/${org()}/${repo}/pulls/${number}`);
}

/**
 * Merge de la PR. La autorización de negocio (rol con pr.merge y autor ≠ quien
 * aprueba) se valida en la capa de acciones antes de llamar aquí. Tras el merge,
 * el workflow build.yml del repo publica automáticamente la nueva imagen de prod.
 */
export async function mergePullRequest(number: number, repo = webRepo()): Promise<void> {
  await gh(`/repos/${org()}/${repo}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
}
