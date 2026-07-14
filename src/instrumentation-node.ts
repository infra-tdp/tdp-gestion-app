/**
 * Arranque del servidor (solo runtime nodejs — lo importa instrumentation.ts):
 *  - siembra el ADMIN inicial si la BD está vacía
 *  - siembra los monitores por defecto (MONITOR_DEFAULTS)
 *  - lanza el scheduler en proceso: checks de disponibilidad, caducidad de
 *    stagings y limpieza de histórico. La app corre con UNA réplica en Coolify,
 *    así que un scheduler en proceso es suficiente y no necesita Redis.
 */
import { ensureAdminSeed } from "@/lib/auth/actions";
import { reloadRbac } from "@/lib/auth/rbac";
import { monitorsTick, pruneOldChecks } from "@/lib/infra/monitors";
import { expireStagingEnvs } from "@/lib/staging/orchestrator";
import { db, schema } from "@/lib/db";

export async function startup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("[startup] DATABASE_URL no definido — scheduler desactivado");
    return;
  }

  try {
    await ensureAdminSeed();
    await seedDefaultMonitors();
    await reloadRbac(); // precarga la matriz de permisos (defaults + overrides de BD)
  } catch (err) {
    console.error("[startup] seed falló (¿migraciones pendientes?):", err);
  }

  const globalRef = globalThis as unknown as { __tdpScheduler?: boolean };
  if (globalRef.__tdpScheduler) return;
  globalRef.__tdpScheduler = true;

  setInterval(() => void monitorsTick().catch((e) => console.error("[monitors]", e)), 15_000);
  setInterval(() => void expireStagingEnvs().catch((e) => console.error("[staging-expiry]", e)), 5 * 60_000);
  setInterval(() => void pruneOldChecks().catch((e) => console.error("[prune]", e)), 24 * 3600_000);
  console.log("[startup] scheduler activo (monitores 15s · caducidad staging 5m · prune 24h)");
}

/**
 * MONITOR_DEFAULTS: lista separada por comas "Nombre|URL" con los monitores a
 * crear si no existen, p. ej.:
 *   Web prod|https://tallerdelpatinete.es,Preprod|https://preprod.tallerdelpatinete.es
 */
async function seedDefaultMonitors(): Promise<void> {
  const defaults = process.env.MONITOR_DEFAULTS;
  if (!defaults) return;
  const existing = await db.select({ url: schema.monitors.url }).from(schema.monitors);
  const known = new Set(existing.map((m) => m.url));
  for (const entry of defaults.split(",")) {
    const [name, url] = entry.split("|").map((s) => s.trim());
    if (!name || !url || known.has(url)) continue;
    await db.insert(schema.monitors).values({ name, url });
    console.log(`[startup] monitor por defecto creado: ${name} → ${url}`);
  }
}
