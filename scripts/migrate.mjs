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

// Resolvemos el SSL en código y quitamos `sslmode` de la URL (pg le da
// prioridad y repisaría lo nuestro). Prioridad: no-verify/disable en la URL
// MANDA siempre (aunque haya CA) → así el escape rápido nunca queda anulado;
// si no, con CA se verifica contra ella; si no, se verifica contra el store.
// Misma lógica que src/lib/db/index.ts.
const { connStr, ssl, sslmode, hasCa, target } = resolveDbSsl(url);
const verify =
  ssl === undefined || ssl === false ? "sin-tls" : ssl.rejectUnauthorized === false ? "off" : "on";
console.log(
  `[migrate] conectando a ${target} (sslmode=${sslmode ?? "none"}, CA=${hasCa ? "sí" : "no"}, verify=${verify})`,
);
const pool = new Pool({ connectionString: connStr, max: 1, ...(ssl !== undefined ? { ssl } : {}) });

function resolveDbSsl(rawUrl) {
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim() || undefined;
  let sslmode = null;
  let connStr = rawUrl;
  let target = "?";
  try {
    const u = new URL(rawUrl);
    sslmode = u.searchParams.get("sslmode");
    target = `${u.host}${u.pathname}`;
    u.searchParams.delete("sslmode");
    connStr = u.toString();
  } catch {
    /* URL no parseable: se deja tal cual y no tocamos ssl */
    return { connStr: rawUrl, ssl: ca ? { ca } : undefined, sslmode: null, hasCa: !!ca, target };
  }
  let ssl;
  if (sslmode === "disable") ssl = false;
  else if (sslmode === "no-verify") ssl = { rejectUnauthorized: false };
  else if (ca) ssl = { ca, rejectUnauthorized: true };
  else if (sslmode) ssl = { rejectUnauthorized: true };
  else ssl = undefined;
  return { connStr, ssl, sslmode, hasCa: !!ca, target };
}

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
