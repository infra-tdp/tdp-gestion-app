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

/** IPv4 en rangos privados (RFC1918). */
export function isPrivateIpv4(ip: string): boolean {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);
}

type UpcloudInterface = {
  type: string; // public | utility | private
  network?: string; // uuid de la red SDN cuando type = private
  ip_addresses?: { ip_address: { address: string; family: string }[] };
};

/**
 * IP privada del servidor UpCloud: la de su interfaz SDN (`type: private`) o, si
 * no hay, la de la red utility incorporada (`type: utility`, 10.x). Si se indica
 * `networkUuid`, se prioriza esa red SDN concreta.
 */
export async function getServerPrivateIp(uuid: string, networkUuid?: string): Promise<string | null> {
  const data = await upcloud<{
    server: { networking?: { interfaces?: { interface: UpcloudInterface[] } } };
  }>(`/server/${uuid}`);
  const ifaces = data.server.networking?.interfaces?.interface ?? [];
  const v4 = (i: UpcloudInterface) =>
    i.ip_addresses?.ip_address?.find((a) => a.family === "IPv4")?.address;

  if (networkUuid) {
    const m = ifaces.find((i) => i.network === networkUuid && v4(i));
    if (m) return v4(m) ?? null;
  }
  const priv = ifaces.find((i) => i.type === "private" && v4(i) && isPrivateIpv4(v4(i)!));
  if (priv) return v4(priv) ?? null;
  const util = ifaces.find((i) => i.type === "utility" && v4(i));
  if (util) return v4(util) ?? null;
  return null;
}

/**
 * Localiza el servidor UpCloud correlacionando por IP (pública/utility) o, si no
 * encaja (p. ej. Coolify reporta una IP de overlay tipo ZeroTier que UpCloud no
 * conoce), por hostname/título (primer label, p. ej. "coolify-prod-2").
 */
export async function findServer(opts: { ip?: string; hostname?: string }): Promise<UpcloudServer | null> {
  const servers = await listServers();
  if (opts.ip) {
    const byIp = servers.find((s) => s.ip_addresses?.ip_address?.some((a) => a.address === opts.ip));
    if (byIp) return byIp;
  }
  if (opts.hostname) {
    const label = opts.hostname.split(".")[0].toLowerCase();
    const byHost = servers.find(
      (s) =>
        s.hostname?.toLowerCase().split(".")[0] === label ||
        s.title?.toLowerCase().includes(label),
    );
    if (byHost) return byHost;
  }
  return null;
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
