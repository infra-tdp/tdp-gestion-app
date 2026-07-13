import "server-only";

/**
 * Cliente de la API de UpCloud (https://developers.upcloud.com/1.3/).
 * Autenticación: Basic con la sub-cuenta de API dedicada (mínimo privilegio),
 * las mismas credenciales que usa el provider de OpenTofu:
 *   UPCLOUD_USERNAME / UPCLOUD_PASSWORD
 */

const BASE = "https://api.upcloud.com/1.3";

export type UpcloudServer = {
  uuid: string;
  title: string;
  hostname: string;
  zone: string;
  state: string; // started | stopped | maintenance | error
  plan: string;
  core_number: string;
  memory_amount: string;
  tags?: { tag: string[] };
  ip_addresses?: { ip_address: { access: string; address: string; family: string }[] };
};

export type UpcloudDatabase = {
  uuid: string;
  name: string;
  title: string;
  type: string; // mysql | pg | valkey ...
  plan: string;
  zone: string;
  state: string; // running | ...
};

function authHeader(): string {
  const user = process.env.UPCLOUD_USERNAME;
  const pass = process.env.UPCLOUD_PASSWORD;
  if (!user || !pass) throw new Error("UPCLOUD_USERNAME / UPCLOUD_PASSWORD no configurados");
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function upcloud<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`UpCloud ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function upcloudConfigured(): boolean {
  return Boolean(process.env.UPCLOUD_USERNAME && process.env.UPCLOUD_PASSWORD);
}

export async function listServers(): Promise<UpcloudServer[]> {
  const data = await upcloud<{ servers: { server: UpcloudServer[] } }>("/server");
  return data.servers.server;
}

export async function getServer(uuid: string): Promise<UpcloudServer> {
  const data = await upcloud<{ server: UpcloudServer }>(`/server/${uuid}`);
  return data.server;
}

export async function startServer(uuid: string): Promise<void> {
  await upcloud(`/server/${uuid}/start`, { method: "POST" });
}

export async function stopServer(uuid: string): Promise<void> {
  await upcloud(`/server/${uuid}/stop`, {
    method: "POST",
    body: JSON.stringify({ stop_server: { stop_type: "soft", timeout: "60" } }),
  });
}

export async function restartServer(uuid: string): Promise<void> {
  await upcloud(`/server/${uuid}/restart`, {
    method: "POST",
    body: JSON.stringify({ restart_server: { stop_type: "soft", timeout: "60", timeout_action: "ignore" } }),
  });
}

export async function listManagedDatabases(): Promise<UpcloudDatabase[]> {
  const data = await upcloud<UpcloudDatabase[] | { databases?: UpcloudDatabase[] }>("/database");
  // La API devuelve un array plano
  return Array.isArray(data) ? data : (data.databases ?? []);
}

export async function getAccount(): Promise<{ username: string; credits: number }> {
  const data = await upcloud<{ account: { username: string; credits: number } }>("/account");
  return data.account;
}
