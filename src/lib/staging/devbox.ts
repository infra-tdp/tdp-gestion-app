import "server-only";
import { coolifyConfigured, listServersCoolify } from "@/lib/infra/coolify";

/**
 * A qué host se conecta el dev por SSH/SFTP para entrar en el devbox de su
 * entorno de staging.
 *
 * El devbox publica su puerto en el NODO donde se creó el entorno (cada entorno
 * puede caer en un nodo distinto), y a ese nodo se llega por ZeroTier: no hay
 * puerto SSH abierto a internet. Por eso el host no puede ser un valor fijo —
 * se resuelve a partir del servidor de Coolify del entorno:
 *
 *   1. STAGING_DEVBOX_HOSTS  override manual JSON {serverUuid: host} (lo que mande)
 *   2. IP del nodo en Coolify — que en esta infraestructura es justamente la de
 *      ZeroTier (los nodos se dan de alta en Coolify por su IP de la overlay)
 *   3. STAGING_DEVBOX_HOST    host único de toda la vida, por si acaso
 *
 * Se marca de dónde salió para poder avisar en la UI cuando la IP no parece de
 * ZeroTier (p. ej. si un nodo se diera de alta por IP pública): así el dev sabe
 * si puede fiarse del comando que se le muestra.
 */

/** Rango de la red ZeroTier (las IPs de los nodos empiezan por aquí). */
const ZEROTIER_PREFIX = process.env.ZEROTIER_IP_PREFIX ?? "172.27.";

export type DevboxHost = {
  /** Host a usar en el comando ssh/sftp. null = no se pudo averiguar. */
  host: string | null;
  /** Nombre del nodo en Coolify, para mostrarlo junto a la IP. */
  nodeName: string | null;
  /** De dónde salió el host (para el aviso de la UI). */
  source: "override" | "zerotier" | "coolify" | "fallback" | null;
};

function overrideFor(serverUuid: string): string | null {
  const raw = process.env.STAGING_DEVBOX_HOSTS;
  if (!raw || !serverUuid) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[serverUuid] || null;
  } catch {
    return null; // JSON mal formado — seguimos con la resolución dinámica
  }
}

export async function resolveDevboxHost(serverUuid: string | null): Promise<DevboxHost> {
  const uuid = serverUuid || process.env.COOLIFY_SERVER_UUID || "";
  const fallback = (process.env.STAGING_DEVBOX_HOST ?? "").trim() || null;

  const manual = overrideFor(uuid);
  if (manual) return { host: manual, nodeName: null, source: "override" };

  if (uuid && coolifyConfigured()) {
    try {
      const node = (await listServersCoolify()).find((s) => s.uuid === uuid);
      if (node?.ip) {
        return {
          host: node.ip,
          nodeName: node.name,
          source: node.ip.startsWith(ZEROTIER_PREFIX) ? "zerotier" : "coolify",
        };
      }
    } catch {
      // Coolify no responde: nos quedamos con el host fijo si lo hay
    }
  }

  return fallback ? { host: fallback, nodeName: null, source: "fallback" } : { host: null, nodeName: null, source: null };
}
