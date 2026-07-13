import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Motor de disponibilidad: comprueba por HTTP las aplicaciones desplegadas
 * (web prod, preprod, Coolify, Grafana, stagings…) y guarda el histórico.
 * El bucle lo arranca instrumentation.ts al levantar el servidor.
 */

const lastRun = new Map<number, number>();

export async function checkMonitor(monitor: typeof schema.monitors.$inferSelect): Promise<void> {
  const started = Date.now();
  let ok = false;
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(monitor.url, {
      method: monitor.method,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(monitor.timeoutMs),
      headers: { "User-Agent": "TDP-Gestion-Monitor/1.0" },
    });
    statusCode = res.status;
    ok = res.status === monitor.expectedStatus;
    if (!ok) error = `HTTP ${res.status} (esperado ${monitor.expectedStatus})`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = Date.now() - started;

  await db.insert(schema.monitorChecks).values({
    monitorId: monitor.id,
    ok,
    statusCode,
    latencyMs,
    error,
  });

  // Notificación de caída: solo en la transición up → down
  if (!ok) {
    const [prev] = await db
      .select({ ok: schema.monitorChecks.ok })
      .from(schema.monitorChecks)
      .where(eq(schema.monitorChecks.monitorId, monitor.id))
      .orderBy(desc(schema.monitorChecks.id))
      .offset(1)
      .limit(1);
    if (!prev || prev.ok) {
      await db.insert(schema.notifications).values({
        type: "monitor.down",
        title: `🔴 ${monitor.name} no responde`,
        body: `${monitor.url} — ${error ?? "sin detalle"}`,
        meta: { monitorId: monitor.id },
      });
    }
  }
}

/** Un tick del bucle: ejecuta los monitores que tocan según su intervalo. */
export async function monitorsTick(): Promise<void> {
  const all = await db.select().from(schema.monitors).where(eq(schema.monitors.enabled, true));
  const now = Date.now();
  await Promise.allSettled(
    all
      .filter((m) => now - (lastRun.get(m.id) ?? 0) >= m.intervalSeconds * 1000)
      .map((m) => {
        lastRun.set(m.id, now);
        return checkMonitor(m);
      }),
  );
}

/** Purga histórico de checks (> 30 días) — se llama a diario desde el scheduler. */
export async function pruneOldChecks(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  await db.delete(schema.monitorChecks).where(lt(schema.monitorChecks.checkedAt, cutoff));
}

export type MonitorSummary = {
  monitor: typeof schema.monitors.$inferSelect;
  lastCheck: typeof schema.monitorChecks.$inferSelect | null;
  uptime24h: number | null;
  avgLatency24h: number | null;
};

export async function monitorSummaries(): Promise<MonitorSummary[]> {
  const all = await db.select().from(schema.monitors).orderBy(schema.monitors.name);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const out: MonitorSummary[] = [];
  for (const monitor of all) {
    const [lastCheck] = await db
      .select()
      .from(schema.monitorChecks)
      .where(eq(schema.monitorChecks.monitorId, monitor.id))
      .orderBy(desc(schema.monitorChecks.id))
      .limit(1);
    const [aggr] = await db
      .select({
        total: sql<number>`count(*)::int`,
        up: sql<number>`count(*) filter (where ${schema.monitorChecks.ok})::int`,
        avgLatency: sql<number>`coalesce(avg(${schema.monitorChecks.latencyMs}), 0)::int`,
      })
      .from(schema.monitorChecks)
      .where(and(eq(schema.monitorChecks.monitorId, monitor.id), gte(schema.monitorChecks.checkedAt, since)));
    out.push({
      monitor,
      lastCheck: lastCheck ?? null,
      uptime24h: aggr && aggr.total > 0 ? Math.round((aggr.up / aggr.total) * 1000) / 10 : null,
      avgLatency24h: aggr && aggr.total > 0 ? aggr.avgLatency : null,
    });
  }
  return out;
}

/** Últimos N checks de un monitor (para la barra de historial en la UI). */
export async function recentChecks(monitorId: number, limit = 60) {
  const rows = await db
    .select()
    .from(schema.monitorChecks)
    .where(eq(schema.monitorChecks.monitorId, monitorId))
    .orderBy(desc(schema.monitorChecks.id))
    .limit(limit);
  return rows.reverse();
}
