"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertPermission } from "@/lib/auth/rbac";
import { restartServer, startServer, stopServer } from "@/lib/infra/upcloud";
import { startTofuRun } from "@/lib/infra/tofu";
import { checkMonitor } from "@/lib/infra/monitors";

/* ------------------------------- Nodos UpCloud ---------------------------- */

export async function nodeAction(uuid: string, action: "start" | "stop" | "restart"): Promise<{ error?: string }> {
  const user = await assertPermission("infra.nodes.manage");
  try {
    if (action === "start") await startServer(uuid);
    else if (action === "stop") await stopServer(uuid);
    else await restartServer(uuid);
    await db.insert(schema.notifications).values({
      type: "node.action",
      title: `⚙️ ${user.name} ejecutó ${action} sobre el nodo ${uuid.slice(0, 8)}…`,
    });
    revalidatePath("/infra/nodes");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/* -------------------------------- OpenTofu -------------------------------- */

export async function runTofu(stack: string, action: "plan" | "apply"): Promise<{ runId?: number; error?: string }> {
  const user = await assertPermission(action === "apply" ? "tofu.apply" : "tofu.plan");
  try {
    const runId = await startTofuRun({ stack, action, userId: user.id });
    revalidatePath("/infra/tofu");
    return { runId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/* -------------------------------- Monitores ------------------------------- */

export async function createMonitor(formData: FormData): Promise<{ error?: string }> {
  await assertPermission("monitors.manage");
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const intervalSeconds = Number(formData.get("interval") ?? 60);
  const expectedStatus = Number(formData.get("expectedStatus") ?? 200);
  if (!name || !url.startsWith("http")) return { error: "Nombre y URL http(s) obligatorios" };
  const [row] = await db
    .insert(schema.monitors)
    .values({ name, url, intervalSeconds, expectedStatus })
    .returning();
  // Primer check inmediato para que la UI muestre estado al instante
  void checkMonitor(row).catch(() => {});
  revalidatePath("/infra/monitors");
  return {};
}

export async function toggleMonitor(id: number, enabled: boolean): Promise<void> {
  await assertPermission("monitors.manage");
  await db.update(schema.monitors).set({ enabled }).where(eq(schema.monitors.id, id));
  revalidatePath("/infra/monitors");
}

export async function deleteMonitor(id: number): Promise<void> {
  await assertPermission("monitors.manage");
  await db.delete(schema.monitors).where(eq(schema.monitors.id, id));
  revalidatePath("/infra/monitors");
}
