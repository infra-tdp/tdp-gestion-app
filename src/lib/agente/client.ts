import "server-only";

/**
 * Cliente de la API interna del agente de tareas WhatsApp
 * (repo infra-tdp/tdp-agente-tareas). Toda la UI de administración vive aquí
 * en TDP Gestión; el agente solo expone esta API con Bearer token.
 *
 *   TASK_AGENT_URL   p. ej. http://agente:3100 (red interna de Coolify)
 *   TASK_AGENT_TOKEN el AGENT_ADMIN_TOKEN del agente
 */

export type AgentSettings = {
  mode: "shadow" | "active";
  debounceSeconds: number;
  maxBatchWaitSeconds: number;
  historyLimit: number;
  repliesEnabled: boolean;
  extraInstructions: string;
};

export type AgentOverview = {
  instance: { name: string; state: string };
  provider: { name: string; projectKey: string; ok: boolean; detail: string };
  stt: { configured: boolean; model: string };
  model: string;
  stats: { chats: number; monitored: number; messages: number; pendingMessages: number };
  settings: AgentSettings;
  lastRuns: AgentRun[];
};

export type AgentChat = {
  id: number;
  jid: string;
  name: string;
  isGroup: boolean;
  monitored: boolean;
  allowReplies: boolean;
  notes: string | null;
  lastMessageAt: string | null;
};

export type AgentPerson = {
  id: number;
  jid: string;
  pushName: string;
  displayName: string | null;
  taskAccountId: string | null;
  aliases: string | null;
};

export type AgentRun = {
  id: number;
  chatId: number;
  chatName: string;
  chatJid: string;
  status: "queued" | "running" | "success" | "error";
  shadow: boolean;
  messageCount: number;
  summary: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type AgentTaskLink = {
  id: number;
  chatId: number;
  chatName: string;
  provider: string;
  taskKey: string;
  summary: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  lastAction: string;
  updatedAt: string;
};

export type AssignableUser = { accountId: string; displayName: string; email: string | null };

export function agentConfigured(): boolean {
  return Boolean(process.env.TASK_AGENT_URL && process.env.TASK_AGENT_TOKEN);
}

export async function agentFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const base = process.env.TASK_AGENT_URL;
  const token = process.env.TASK_AGENT_TOKEN;
  if (!base || !token) {
    return { ok: false, error: "Agente sin configurar: faltan TASK_AGENT_URL / TASK_AGENT_TOKEN." };
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Agente HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo contactar con el agente: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
