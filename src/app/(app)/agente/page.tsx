import Link from "next/link";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import {
  agentConfigured,
  agentFetch,
  type AgentChat,
  type AgentOverview,
  type AgentPerson,
  type AgentRun,
  type AgentTaskLink,
  type AssignableUser,
} from "@/lib/agente/client";
import { Badge, Card, EmptyState, Kpi, PageHeader, formatDate, timeAgo } from "@/components/ui";
import {
  AgentContextForm,
  AgentSettingsForm,
  ChatRowControls,
  PersonRow,
  SyncChatsButton,
} from "./agente-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agente WhatsApp" };

const RUNS_PER_PAGE = 15;

export default async function AgentePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("agente.view");
  const canManage = hasPermission(user.role, "agente.manage");

  if (!agentConfigured()) {
    return (
      <>
        <PageHeader eyebrow="Automatización" title="Agente WhatsApp" />
        <EmptyState
          title="Agente sin configurar"
          detail="Faltan TASK_AGENT_URL y TASK_AGENT_TOKEN en el entorno de esta app. Despliega el servicio tdp-agente-tareas (ver docs/agente-tareas.md) y añade ambas variables en Coolify."
        />
      </>
    );
  }

  const sp = await searchParams;
  const epRaw = Array.isArray(sp.ep) ? sp.ep[0] : sp.ep;
  const runsPage = Math.max(1, Number(epRaw) || 1);
  const runsOffset = (runsPage - 1) * RUNS_PER_PAGE;

  const [overviewRes, chatsRes, peopleRes, tasksRes, usersRes, runsRes] = await Promise.all([
    agentFetch<AgentOverview>("/admin/overview"),
    agentFetch<AgentChat[]>("/admin/chats"),
    agentFetch<AgentPerson[]>("/admin/people"),
    agentFetch<AgentTaskLink[]>("/admin/tasks"),
    agentFetch<AssignableUser[]>("/admin/provider/users?q="),
    // Pedimos uno de más para saber si hay página siguiente sin un count aparte.
    agentFetch<AgentRun[]>(`/admin/runs?limit=${RUNS_PER_PAGE + 1}&offset=${runsOffset}`),
  ]);

  if (!overviewRes.ok) {
    return (
      <>
        <PageHeader eyebrow="Automatización" title="Agente WhatsApp" />
        <EmptyState title="Agente no disponible" detail={overviewRes.error} />
      </>
    );
  }

  const overview = overviewRes.data;
  const chats = chatsRes.ok ? chatsRes.data : [];
  const people = peopleRes.ok ? peopleRes.data : [];
  const tasks = tasksRes.ok ? tasksRes.data : [];
  const assignableUsers = usersRes.ok ? usersRes.data : [];

  // Ejecuciones paginadas (fallback a las del overview si el endpoint fallara).
  const runsRaw = runsRes.ok ? runsRes.data : runsPage === 1 ? overview.lastRuns : [];
  const runs = runsRaw.slice(0, RUNS_PER_PAGE);
  const hasPrevRuns = runsPage > 1;
  const hasNextRuns = runsRaw.length > RUNS_PER_PAGE;

  const instanceOk = overview.instance.state === "open";
  const shadow = overview.settings.mode === "shadow";

  return (
    <>
      <PageHeader
        eyebrow="Automatización"
        title="Agente WhatsApp"
        actions={canManage ? <SyncChatsButton /> : undefined}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi
          label="WhatsApp"
          value={instanceOk ? "Conectado" : overview.instance.state}
          detail={`Instancia ${overview.instance.name}`}
          tone={instanceOk ? "success" : "danger"}
        />
        <Kpi
          label={overview.provider.name.toUpperCase()}
          value={overview.provider.ok ? "OK" : "Error"}
          detail={overview.provider.ok ? `Proyecto ${overview.provider.projectKey}` : overview.provider.detail}
          tone={overview.provider.ok ? "success" : "danger"}
        />
        <Kpi
          label="Modo"
          value={shadow ? "Shadow" : "Activo"}
          detail={shadow ? "Registra sin ejecutar" : "Ejecuta en el gestor"}
          tone={shadow ? "warning" : "success"}
        />
        <Kpi
          label="Pendientes"
          value={overview.stats.pendingMessages}
          detail={`${overview.stats.monitored} chats monitorizados · ${overview.stats.messages} mensajes`}
        />
      </div>

      {!overview.stt.configured && (
        <Card className="mb-4" accent={false}>
          <span className="text-warning font-semibold">Transcripción desactivada:</span>{" "}
          <span className="text-muted text-sm">
            sin STT_API_KEY en el agente, las notas de voz no se transcriben (se procesará solo el texto).
          </span>
        </Card>
      )}

      {canManage && (
        <Card className="mb-4">
          <h2 className="headline text-2xl mb-3">Ajustes del agente</h2>
          <AgentSettingsForm settings={overview.settings} />
        </Card>
      )}

      {canManage && (
        <Card className="mb-4">
          <h2 className="headline text-2xl mb-3">Contexto y reglas del agente</h2>
          <AgentContextForm settings={overview.settings} />
        </Card>
      )}

      <Card className="mb-4" accent={false}>
        <h2 className="headline text-2xl mb-3">Chats</h2>
        {chats.length === 0 ? (
          <div className="text-muted text-sm">
            Sin chats todavía. Usa «Sincronizar chats» (o espera a que llegue algún mensaje a la
            instancia) y activa la monitorización de los grupos de trabajo.
          </div>
        ) : (
          <div className="space-y-2">
            {chats.map((chat) => (
              <div key={chat.id} className="border border-border-dark rounded p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="min-w-52 flex-1">
                    <div className="font-bold">
                      {chat.name || chat.jid.split("@")[0]}{" "}
                      {chat.isGroup && <Badge tone="outline">grupo</Badge>}{" "}
                      {chat.monitored ? (
                        <Badge tone="success">monitorizado</Badge>
                      ) : (
                        <Badge tone="neutral">ignorado</Badge>
                      )}{" "}
                      {chat.monitored && chat.allowReplies && <Badge tone="warning">responde</Badge>}
                    </div>
                    <div className="text-muted text-[12px]">
                      {chat.jid} · último mensaje {timeAgo(chat.lastMessageAt)}
                    </div>
                  </div>
                  {canManage && <ChatRowControls chat={chat} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-4" accent={false}>
        <h2 className="headline text-2xl mb-3">Personas y mapeo a {overview.provider.name}</h2>
        <p className="text-muted text-[13px] mb-3">
          El agente asigna tickets usando este mapeo. Sin accountId, la persona se menciona pero no
          se le asigna nada.
        </p>
        {people.length === 0 ? (
          <div className="text-muted text-sm">
            Aún no se ha visto a nadie: aparecerán automáticamente según lleguen mensajes de los
            chats monitorizados.
          </div>
        ) : (
          <div className="space-y-2">
            {people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                users={assignableUsers}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-4" accent={false}>
        <h2 className="headline text-2xl mb-3">Tickets vinculados</h2>
        <p className="text-muted text-[12px] mb-3">
          Estado en vivo desde {overview.provider.name}. Se muestran solo los tickets abiertos.
        </p>
        {tasks.length === 0 ? (
          <div className="text-muted text-sm">No hay tickets abiertos vinculados a los chats.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted text-left text-[11px] uppercase tracking-wider">
                  <th className="py-1.5 pr-3">Ticket</th>
                  <th className="py-1.5 pr-3">Resumen</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3">Prioridad</th>
                  <th className="py-1.5 pr-3">Asignado</th>
                  <th className="py-1.5 pr-3">Chat</th>
                  <th className="py-1.5">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-t border-border-dark">
                    <td className="py-2 pr-3 font-bold text-primary">
                      {t.url ? (
                        <a href={t.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {t.taskKey}
                        </a>
                      ) : (
                        t.taskKey
                      )}
                    </td>
                    <td className="py-2 pr-3">{t.summary || "—"}</td>
                    <td className="py-2 pr-3">{t.status || "—"}</td>
                    <td className="py-2 pr-3">{t.priority ?? "—"}</td>
                    <td className="py-2 pr-3">{t.assignee ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted">{t.chatName}</td>
                    <td className="py-2 text-muted">{timeAgo(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card accent={false}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="headline text-2xl">Últimas ejecuciones</h2>
          {(hasPrevRuns || hasNextRuns) && (
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted">Página {runsPage}</span>
              {hasPrevRuns ? (
                <Link href={`/agente?ep=${runsPage - 1}`} className="btn-dark !py-1 !px-2.5 text-[12px]" scroll={false}>
                  ← Anteriores
                </Link>
              ) : (
                <span className="btn-dark !py-1 !px-2.5 text-[12px] opacity-40 cursor-not-allowed">← Anteriores</span>
              )}
              {hasNextRuns ? (
                <Link href={`/agente?ep=${runsPage + 1}`} className="btn-dark !py-1 !px-2.5 text-[12px]" scroll={false}>
                  Siguientes →
                </Link>
              ) : (
                <span className="btn-dark !py-1 !px-2.5 text-[12px] opacity-40 cursor-not-allowed">Siguientes →</span>
              )}
            </div>
          )}
        </div>
        {runs.length === 0 ? (
          <div className="text-muted text-sm">
            {runsPage === 1
              ? "Sin ejecuciones todavía. Cuando lleguen mensajes a un chat monitorizado, el agente los agrupará y aparecerá aquí el resultado."
              : "No hay más ejecuciones en esta página."}
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="border border-border-dark rounded p-3">
                <div className="flex items-center gap-2 flex-wrap text-[13px]">
                  <Badge
                    tone={run.status === "success" ? "success" : run.status === "error" ? "danger" : "warning"}
                  >
                    {run.status}
                  </Badge>
                  {run.shadow && <Badge tone="outline">shadow</Badge>}
                  <span className="font-bold">{run.chatName || run.chatJid}</span>
                  <span className="text-muted">
                    {run.messageCount} mensajes · {formatDate(run.createdAt)}
                  </span>
                </div>
                {run.summary && <div className="text-[13px] mt-1.5 whitespace-pre-wrap">{run.summary}</div>}
                {run.error && <div className="text-danger text-[13px] mt-1.5">{run.error}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
