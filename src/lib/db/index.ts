import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Pool global (sobrevive a HMR en dev). En producción una única instancia
 * por proceso — la app corre con una réplica en Coolify.
 */
const globalForDb = globalThis as unknown as { __tdpPool?: Pool };

const pool =
  globalForDb.__tdpPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__tdpPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
