import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { monitorSummaries } from "@/lib/infra/monitors";
import { listServers, upcloudConfigured } from "@/lib/infra/upcloud";

/**
 * Asistente IA de TDP Gestión (fase 1: infraestructura).
 * Claude con herramientas de SOLO LECTURA sobre el estado del sistema:
 * monitores, nodos UpCloud, stagings, runs de tofu y notificaciones.
 * En fases CRM se ampliará con ventas, stock y reposición.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const getAvailability = betaTool({
  name: "get_availability",
  description:
    "Estado actual de disponibilidad de los servicios monitorizados (web, preprod, Coolify...): último check, uptime 24h y latencia media.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    const summaries = await monitorSummaries();
    return JSON.stringify(
      summaries.map((s) => ({
        name: s.monitor.name,
        url: s.monitor.url,
        up: s.lastCheck?.ok ?? null,
        lastError: s.lastCheck?.error ?? null,
        uptime24h: s.uptime24h,
        avgLatencyMs: s.avgLatency24h,
      })),
    );
  },
});

const getNodes = betaTool({
  name: "get_nodes",
  description: "Lista los servidores (nodos) de UpCloud con su estado, zona y plan.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    if (!upcloudConfigured()) return "UpCloud no está configurado (faltan credenciales).";
    const servers = await listServers();
    return JSON.stringify(
      servers.map((s) => ({ title: s.title, hostname: s.hostname, zone: s.zone, state: s.state, plan: s.plan })),
    );
  },
});

const getStagingEnvs = betaTool({
  name: "get_staging_envs",
  description: "Lista los entornos de staging de la web (estado, rama, imagen, PR, caducidad).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    const envs = await db.select().from(schema.stagingEnvs).orderBy(desc(schema.stagingEnvs.createdAt)).limit(20);
    return JSON.stringify(
      envs.map((e) => ({
        slug: e.slug,
        status: e.status,
        branch: e.branch,
        imageTag: e.imageTag,
        url: e.url,
        pr: e.prNumber,
        expiresAt: e.expiresAt,
        error: e.errorMessage,
      })),
    );
  },
});

const getTofuRuns = betaTool({
  name: "get_tofu_runs",
  description: "Últimas ejecuciones de OpenTofu (plan/apply por stack) con su resultado.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    const runs = await db.select().from(schema.tofuRuns).orderBy(desc(schema.tofuRuns.createdAt)).limit(15);
    return JSON.stringify(
      runs.map((r) => ({
        id: r.id,
        stack: r.stack,
        action: r.action,
        status: r.status,
        exitCode: r.exitCode,
        createdAt: r.createdAt,
      })),
    );
  },
});

const getNotifications = betaTool({
  name: "get_notifications",
  description: "Últimas notificaciones del sistema (caídas, stagings, PRs, acciones sobre nodos).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    const notes = await db.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)).limit(20);
    return JSON.stringify(notes.map((n) => ({ type: n.type, title: n.title, body: n.body, at: n.createdAt })));
  },
});

const SYSTEM = `Eres el asistente interno de TDP Gestión, el panel de control de Taller del Patinete (tiendas y taller de patinetes eléctricos en España).
Hablas SIEMPRE en español, con respuestas directas y accionables.
Fase actual: gestión de infraestructura (nodos UpCloud, OpenTofu, disponibilidad, entornos staging para devs y flujo de PRs de la web).
Usa las herramientas para consultar el estado real antes de responder — nunca inventes datos. Si algo está caído o en error, dilo claramente y sugiere el siguiente paso operativo.
Las fases siguientes añadirán facturación por tiendas, ventas/reparaciones (SatTPV), stock y reposición automática; si preguntan por ellas, explica que están en el roadmap.`;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function runAssistant(history: ChatMessage[]): Promise<string> {
  const client = new Anthropic();
  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    tools: [getAvailability, getNodes, getStagingEnvs, getTofuRuns, getNotifications],
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    max_iterations: 8,
  });

  const text = finalMessage.content
    .filter((b): b is Extract<(typeof finalMessage.content)[number], { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text || "(sin respuesta)";
}
