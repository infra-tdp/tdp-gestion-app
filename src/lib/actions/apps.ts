"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertPermission } from "@/lib/auth/rbac";
import { runAppRouting } from "@/lib/infra/apps";

/** Lista "1,2" o "1 2" → ["1","2"] (claves de var.nodes, saneadas). */
function parseNodes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => /^[a-z0-9][a-z0-9-]{0,30}$/i.test(s)),
    ),
  );
}

export async function createApp(formData: FormData): Promise<{ error?: string }> {
  const user = await assertPermission("apps.manage");

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const host = String(formData.get("host") ?? "").trim().toLowerCase();
  const repo = String(formData.get("repo") ?? "").trim() || null;
  const port = Number(formData.get("port") ?? 3000);
  const healthPath = String(formData.get("healthPath") ?? "/api/health").trim() || "/api/health";
  const nodes = parseNodes(String(formData.get("nodes") ?? ""));

  if (!/^[a-z0-9][a-z0-9-]{0,58}$/.test(slug)) {
    return { error: "Slug inválido (minúsculas, números y guiones)." };
  }
  if (!name) return { error: "Falta el nombre." };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { error: "Host (dominio) inválido." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Puerto inválido." };
  if (nodes.length === 0) return { error: "Indica al menos un nodo (p.ej. 1 o 1,2)." };

  try {
    await db.insert(schema.apps).values({
      slug,
      name,
      host,
      repo,
      port,
      healthPath,
      nodes,
      createdBy: user.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) return { error: `Ya existe una app con slug "${slug}".` };
    return { error: msg };
  }
  revalidatePath("/infra/apps");
  return {};
}

export async function updateApp(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertPermission("apps.manage");
  const host = String(formData.get("host") ?? "").trim().toLowerCase();
  const port = Number(formData.get("port") ?? 3000);
  const healthPath = String(formData.get("healthPath") ?? "/api/health").trim() || "/api/health";
  const nodes = parseNodes(String(formData.get("nodes") ?? ""));

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { error: "Host (dominio) inválido." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Puerto inválido." };
  if (nodes.length === 0) return { error: "Indica al menos un nodo." };

  await db
    .update(schema.apps)
    .set({ host, port, healthPath, nodes, updatedAt: new Date() })
    .where(eq(schema.apps.id, id));
  revalidatePath("/infra/apps");
  return {};
}

export async function toggleApp(id: number, enabled: boolean): Promise<void> {
  await assertPermission("apps.manage");
  await db.update(schema.apps).set({ enabled, updatedAt: new Date() }).where(eq(schema.apps.id, id));
  revalidatePath("/infra/apps");
}

export async function deleteApp(id: number): Promise<void> {
  await assertPermission("apps.manage");
  await db.delete(schema.apps).where(eq(schema.apps.id, id));
  revalidatePath("/infra/apps");
}

/**
 * Renderiza el registro a apps.auto.tfvars.json y lanza plan/apply del enrutado
 * del LB. `apply` exige tofu.apply (separación de funciones).
 */
export async function applyRouting(
  action: "plan" | "apply",
): Promise<{ runId?: number; error?: string }> {
  const user = await assertPermission(action === "apply" ? "tofu.apply" : "tofu.plan");
  try {
    const runId = await runAppRouting(action, user.id);
    revalidatePath("/infra/apps");
    return { runId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
