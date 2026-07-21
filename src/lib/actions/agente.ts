"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/rbac";
import { agentFetch, type AgentSettings } from "@/lib/agente/client";

/** Server actions del módulo Agente WhatsApp — proxy con RBAC hacia la API del agente. */

type ActionResult = { error?: string };

function toError(res: { ok: boolean; error?: string }): ActionResult {
  return res.ok ? {} : { error: res.error };
}

export async function syncAgentChats(): Promise<ActionResult> {
  await assertPermission("agente.manage");
  const res = await agentFetch("/admin/chats/sync", { method: "POST" });
  revalidatePath("/agente");
  return toError(res);
}

export async function setChatMonitored(id: number, monitored: boolean): Promise<ActionResult> {
  await assertPermission("agente.manage");
  const res = await agentFetch(`/admin/chats/${id}`, { method: "PATCH", body: { monitored } });
  revalidatePath("/agente");
  return toError(res);
}

export async function setChatReplies(id: number, allowReplies: boolean): Promise<ActionResult> {
  await assertPermission("agente.manage");
  const res = await agentFetch(`/admin/chats/${id}`, { method: "PATCH", body: { allowReplies } });
  revalidatePath("/agente");
  return toError(res);
}

export async function saveChatNotes(id: number, formData: FormData): Promise<ActionResult> {
  await assertPermission("agente.manage");
  const notes = String(formData.get("notes") ?? "").trim();
  const res = await agentFetch(`/admin/chats/${id}`, {
    method: "PATCH",
    body: { notes: notes || null },
  });
  revalidatePath("/agente");
  return toError(res);
}

export async function processChatNow(id: number): Promise<ActionResult> {
  await assertPermission("agente.manage");
  const res = await agentFetch(`/admin/chats/${id}/process`, { method: "POST" });
  revalidatePath("/agente");
  return toError(res);
}

export async function savePerson(id: number, formData: FormData): Promise<ActionResult> {
  await assertPermission("agente.manage");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const taskAccountId = String(formData.get("taskAccountId") ?? "").trim();
  const aliases = String(formData.get("aliases") ?? "").trim();
  const res = await agentFetch(`/admin/people/${id}`, {
    method: "PATCH",
    body: {
      displayName: displayName || null,
      taskAccountId: taskAccountId || null,
      aliases: aliases || null,
    },
  });
  revalidatePath("/agente");
  return toError(res);
}

export async function saveAgentSettings(formData: FormData): Promise<ActionResult> {
  await assertPermission("agente.manage");

  const mode = formData.get("mode") === "active" ? "active" : "shadow";
  const patch: Partial<AgentSettings> = {
    mode,
    repliesEnabled: formData.get("repliesEnabled") === "on",
    extraInstructions: String(formData.get("extraInstructions") ?? "").trim(),
  };
  const debounce = Number(formData.get("debounceSeconds"));
  if (Number.isInteger(debounce) && debounce >= 10 && debounce <= 1800) {
    patch.debounceSeconds = debounce;
  }
  const maxWait = Number(formData.get("maxBatchWaitSeconds"));
  if (Number.isInteger(maxWait) && maxWait >= 60 && maxWait <= 3600) {
    patch.maxBatchWaitSeconds = maxWait;
  }

  const res = await agentFetch("/admin/settings", { method: "PUT", body: patch });
  revalidatePath("/agente");
  return toError(res);
}
