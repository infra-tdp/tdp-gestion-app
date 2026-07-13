/**
 * Migrador de arranque: se ejecuta en el entrypoint del contenedor antes de
 * levantar el servidor. Usa el node_modules trazado del build standalone.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL no definido");
  process.exit(1);
}

const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
const pool = new Pool({ connectionString: url, max: 1, ...(ca ? { ssl: { ca } } : {}) });

// La BD puede tardar unos segundos en aceptar conexiones tras el deploy
for (let attempt = 1; attempt <= 15; attempt++) {
  try {
    await pool.query("select 1");
    break;
  } catch (err) {
    if (attempt === 15) {
      console.error("[migrate] BD inalcanzable:", err.message);
      process.exit(1);
    }
    console.log(`[migrate] esperando BD (${attempt}/15)…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

console.log("[migrate] aplicando migraciones…");
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
console.log("[migrate] OK");
await pool.end();
