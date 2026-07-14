import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

/**
 * Config del pool. La BD de producción es la PostgreSQL gestionada de UpCloud,
 * que presenta un certificado firmado por su CA privada. Resolvemos el SSL en
 * código y quitamos `sslmode` de la URL (pg le da prioridad y repisaría lo
 * nuestro). Prioridad, de mayor a menor:
 *   1. `sslmode=disable`   → sin TLS.
 *   2. `sslmode=no-verify` → TLS sin verificar el certificado (MANDA aunque
 *      haya DATABASE_CA_CERT: es el escape rápido y nunca debe quedar anulado).
 *   3. DATABASE_CA_CERT    → verificación completa contra esa CA.
 *   4. cualquier otro sslmode (require/verify-full) → verificación contra el
 *      almacén del sistema.
 * Debe coincidir con scripts/migrate.mjs.
 */
function buildPoolConfig(): PoolConfig {
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim() || undefined;
  const rawUrl = process.env.DATABASE_URL;
  let sslmode: string | null = null;
  let connectionString = rawUrl;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      sslmode = u.searchParams.get("sslmode");
      u.searchParams.delete("sslmode");
      connectionString = u.toString();
    } catch {
      /* URL no parseable: se deja tal cual */
      return { connectionString: rawUrl, max: 10, ...(ca ? { ssl: { ca } } : {}) };
    }
  }
  let ssl: PoolConfig["ssl"];
  if (sslmode === "disable") ssl = false;
  else if (sslmode === "no-verify") ssl = { rejectUnauthorized: false };
  else if (ca) ssl = { ca, rejectUnauthorized: true };
  else if (sslmode) ssl = { rejectUnauthorized: true };
  return { connectionString, max: 10, ...(ssl !== undefined ? { ssl } : {}) };
}

/**
 * Pool global (sobrevive a HMR en dev). En producción una única instancia
 * por proceso — la app corre con una réplica en Coolify.
 */
const globalForDb = globalThis as unknown as { __tdpPool?: Pool };

const pool = globalForDb.__tdpPool ?? new Pool(buildPoolConfig());

if (process.env.NODE_ENV !== "production") globalForDb.__tdpPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
