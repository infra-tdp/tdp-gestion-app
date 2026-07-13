import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Aplica las migraciones de ./drizzle. Se ejecuta en el arranque del contenedor
 * (docker-entrypoint) y es idempotente — seguro en cada deploy de Coolify.
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = drizzle(pool);
  console.log("[migrate] aplicando migraciones…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] OK");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] error:", err);
  process.exit(1);
});
