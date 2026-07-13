import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

/**
 * Config del pool. La BD de producción es la PostgreSQL gestionada de UpCloud,
 * que presenta un certificado firmado por su CA privada. `pg` trata
 * `sslmode=require` como verify-full y, al mezclar la connectionString, da
 * PRIORIDAD al sslmode de la URL sobre cualquier `ssl` explícito — descartando
 * la CA. Por eso, cuando aportamos DATABASE_CA_CERT, quitamos el sslmode de la
 * URL para que la verificación se haga contra nuestra CA. Sin CA, se respeta el
 * sslmode de la URL (p. ej. `no-verify`).
 */
function buildPoolConfig(): PoolConfig {
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  let connectionString = process.env.DATABASE_URL;
  if (ca && connectionString) {
    try {
      const u = new URL(connectionString);
      u.searchParams.delete("sslmode");
      connectionString = u.toString();
    } catch {
      /* URL no parseable: se deja tal cual */
    }
  }
  return { connectionString, max: 10, ...(ca ? { ssl: { ca } } : {}) };
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
