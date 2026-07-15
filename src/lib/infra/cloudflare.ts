import "server-only";

/**
 * Enrutado dinámico de los entornos de staging vía Cloudflare Tunnel.
 *
 * Cada entorno vive en el nodo que elige el dev (prod-1 o prod-2), así que la
 * ruta pública `<slug>.staging.tallerdelpatinete.es` tiene que apuntar al nodo
 * correcto. Como el nodo varía, lo gestionamos por API: al desplegar añadimos
 * una regla de ingress al Tunnel (`hostname → http://<ip-nodo>:80`, el Traefik
 * de ese nodo) y el registro DNS; al destruir, los quitamos.
 *
 * Requisitos (variables de entorno):
 *   CF_API_TOKEN    token con permisos: Account · Cloudflare Tunnel:Edit y
 *                   Zone · DNS:Edit sobre la zona de tallerdelpatinete.es
 *   CF_ACCOUNT_ID   id de la cuenta de Cloudflare
 *   CF_TUNNEL_ID    id (UUID) del Tunnel cuyo cloudflared alcanza AMBOS nodos
 *                   por IP privada (10.0.0.x)
 *   CF_ZONE_ID      (opcional) id de zona; si está, gestionamos también el DNS
 *                   (CNAME proxied → <CF_TUNNEL_ID>.cfargotunnel.com). Si ya
 *                   tienes un wildcard *.staging → el túnel, puedes omitirlo.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

function token(): string {
  const t = process.env.CF_API_TOKEN;
  if (!t) throw new Error("CF_API_TOKEN no configurado");
  return t;
}

export function cloudflareRoutingConfigured(): boolean {
  return Boolean(process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_ID && process.env.CF_TUNNEL_ID);
}

async function cf<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json: { success?: boolean; errors?: unknown; result?: unknown } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok || (json && json.success === false)) {
    const errs = json?.errors ? JSON.stringify(json.errors) : text.slice(0, 300);
    throw new Error(`Cloudflare ${init?.method ?? "GET"} ${path} → ${res.status}: ${errs}`);
  }
  return json?.result as T;
}

type Ingress = { hostname?: string; service: string; path?: string; originRequest?: unknown };
type TunnelConfig = { config?: { ingress?: Ingress[] } };
type DnsRecord = { id: string; name: string };

function tunnelCname(): string {
  return `${process.env.CF_TUNNEL_ID}.cfargotunnel.com`;
}

function accountPath(): string {
  return `/accounts/${process.env.CF_ACCOUNT_ID}/cfd_tunnel/${process.env.CF_TUNNEL_ID}/configurations`;
}

/**
 * Crea/actualiza la ruta de `hostname` hacia `http://<nodeIp>:80` (Traefik del
 * nodo) en el ingress del Tunnel, y el DNS si hay zona. Idempotente.
 */
export async function upsertStagingRoute(hostname: string, nodeIp: string): Promise<void> {
  const service = `http://${nodeIp}:80`;

  // 1. Ingress del túnel: reemplaza/añade la regla del hostname, deja el
  //    catch-all (regla sin hostname) SIEMPRE al final.
  const cfg = await cf<TunnelConfig>(accountPath());
  const current = cfg?.config?.ingress ?? [];
  const catchAll = current.find((r) => !r.hostname) ?? { service: "http_status:404" };
  const others = current.filter((r) => r.hostname && r.hostname !== hostname);
  const ingress: Ingress[] = [...others, { hostname, service }, catchAll];
  await cf(accountPath(), { method: "PUT", body: JSON.stringify({ config: { ingress } }) });

  // 2. DNS (CNAME proxied → túnel) si hay zona y no existe ya.
  const zone = process.env.CF_ZONE_ID;
  if (zone) {
    const existing = await cf<DnsRecord[]>(
      `/zones/${zone}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
    );
    if (!existing || existing.length === 0) {
      await cf(`/zones/${zone}/dns_records`, {
        method: "POST",
        body: JSON.stringify({
          type: "CNAME",
          name: hostname,
          content: tunnelCname(),
          proxied: true,
          comment: "TDP staging (auto)",
        }),
      });
    }
  }
}

/** Quita la ruta del túnel y el DNS de `hostname`. No fatal. */
export async function removeStagingRoute(hostname: string): Promise<void> {
  try {
    const cfg = await cf<TunnelConfig>(accountPath());
    const current = cfg?.config?.ingress ?? [];
    if (current.some((r) => r.hostname === hostname)) {
      const ingress = current.filter((r) => r.hostname !== hostname);
      await cf(accountPath(), { method: "PUT", body: JSON.stringify({ config: { ingress } }) });
    }
  } catch {
    // el túnel ya no tiene la regla o la API falló — no bloquea la destrucción
  }
  const zone = process.env.CF_ZONE_ID;
  if (zone) {
    try {
      const existing = await cf<DnsRecord[]>(
        `/zones/${zone}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
      );
      for (const r of existing ?? []) {
        await cf(`/zones/${zone}/dns_records/${r.id}`, { method: "DELETE" });
      }
    } catch {
      // idem
    }
  }
}
