import "server-only";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { startTofuRun } from "./tofu";

/**
 * Registro de apps → enrutado por Host del LB.
 *
 * gestion es el plano de control: cada app registrada (slug, host, nodos) se
 * traduce a la variable `var.apps` del stack `coolify-prod` de tdp-tienda-infra
 * (ver app-routing.tf). Al lanzar plan/apply, se escribe apps.auto.tfvars.json
 * en el stack (tras el sync del runner) y tofu crea backend + regla de frontend
 * por Host + health check por app. El túnel de Cloudflare sigue apuntando al LB.
 */

const ROUTING_STACK = "coolify-prod";
const TFVARS_FILE = "apps.auto.tfvars.json";

export type AppRow = typeof schema.apps.$inferSelect;

export async function listApps(): Promise<AppRow[]> {
  return db.select().from(schema.apps).orderBy(asc(schema.apps.slug));
}

/** Nodos de una fila del registro, saneados a lista de strings. */
export function appNodes(a: AppRow): string[] {
  return Array.isArray(a.nodes) ? (a.nodes as unknown[]).map(String) : [];
}

/**
 * Renderiza el contenido de apps.auto.tfvars.json (objeto `var.apps`) a partir
 * del registro. Solo apps activas y con al menos un nodo (un backend sin miembros
 * no tiene sentido y el health por-app quedaría sin destino).
 */
export async function renderAppsTfvars(): Promise<string> {
  const rows = await listApps();
  const apps: Record<string, { host: string; nodes: string[]; health_path: string }> = {};
  for (const a of rows) {
    const nodes = appNodes(a);
    if (!a.enabled || nodes.length === 0) continue;
    apps[a.slug] = { host: a.host, nodes, health_path: a.healthPath };
  }
  return JSON.stringify({ apps }, null, 2) + "\n";
}

/**
 * Lanza plan/apply del stack de enrutado inyectando el tfvars generado. Devuelve
 * el id del run de tofu (seguible desde /infra/tofu/runs/[id]).
 */
export async function runAppRouting(action: "plan" | "apply", userId: number): Promise<number> {
  const contents = await renderAppsTfvars();
  return startTofuRun({
    stack: ROUTING_STACK,
    action,
    userId,
    prepare: async (stackDir) => {
      await writeFile(path.join(stackDir, TFVARS_FILE), contents, "utf8");
    },
  });
}
