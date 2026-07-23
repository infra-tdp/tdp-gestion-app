"use client";

import { useState, useTransition } from "react";
import {
  processChatNow,
  saveAgentContext,
  saveAgentSettings,
  saveChatNotes,
  savePerson,
  setChatMonitored,
  setChatReplies,
  syncAgentChats,
} from "@/lib/actions/agente";
import type { AgentChat, AgentPerson, AgentSettings, AssignableUser } from "@/lib/agente/client";

/** Controles cliente del módulo Agente WhatsApp (la página es server component). */

export function SyncChatsButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-danger text-sm font-semibold">{error}</span>}
      <button
        className="btn-outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await syncAgentChats();
            setError(res.error ?? null);
          })
        }
      >
        {pending ? "Sincronizando…" : "Sincronizar chats"}
      </button>
    </div>
  );
}

export function ChatRowControls({ chat }: { chat: AgentChat }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error ?? null);
    });

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="inline-flex gap-1.5 flex-wrap justify-end">
        <button
          className={chat.monitored ? "btn-dark !py-1 !px-2.5 text-[12px]" : "btn-primary !py-1 !px-2.5 text-[12px]"}
          disabled={pending}
          onClick={() => run(() => setChatMonitored(chat.id, !chat.monitored))}
        >
          {chat.monitored ? "Dejar de monitorizar" : "Monitorizar"}
        </button>
        {chat.monitored && (
          <>
            <button
              className="btn-dark !py-1 !px-2.5 text-[12px]"
              disabled={pending}
              onClick={() => run(() => setChatReplies(chat.id, !chat.allowReplies))}
            >
              {chat.allowReplies ? "Silenciar respuestas" : "Permitir respuestas"}
            </button>
            <button
              className="btn-dark !py-1 !px-2.5 text-[12px]"
              disabled={pending}
              onClick={() => run(() => processChatNow(chat.id))}
            >
              Procesar ahora
            </button>
            <button className="btn-dark !py-1 !px-2.5 text-[12px]" onClick={() => setShowNotes((v) => !v)}>
              Notas
            </button>
          </>
        )}
      </div>
      {showNotes && chat.monitored && (
        <form
          className="flex gap-2 w-full min-w-72"
          action={(fd) => run(() => saveChatNotes(chat.id, fd))}
        >
          <input
            name="notes"
            className="tdp-input flex-1"
            defaultValue={chat.notes ?? ""}
            placeholder="Contexto del chat para el agente (de qué va, reglas propias…)"
          />
          <button type="submit" className="btn-primary !py-1 !px-2.5 text-[12px]" disabled={pending}>
            Guardar
          </button>
        </form>
      )}
      {error && <span className="text-danger text-[12px] font-semibold">{error}</span>}
    </div>
  );
}

export function PersonRow({
  person,
  users,
  canManage,
}: {
  person: AgentPerson;
  users: AssignableUser[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Campos CONTROLADOS: React 19 resetea los <form action> al terminar, lo que
  // revertía el <select> no controlado a "sin asignar" tras guardar (aunque en BD
  // sí se guardaba). Con estado propio, el valor guardado permanece visible.
  const [displayName, setDisplayName] = useState(person.displayName ?? "");
  const [taskAccountId, setTaskAccountId] = useState(person.taskAccountId ?? "");
  const [aliases, setAliases] = useState(person.aliases ?? "");

  const mapped = users.find((u) => u.accountId === person.taskAccountId);

  if (!canManage) {
    return (
      <div className="border border-border-dark rounded p-3 flex items-center gap-3 flex-wrap text-[13px]">
        <span className="font-bold">{person.displayName || person.pushName || person.jid.split("@")[0]}</span>
        <span className="text-muted">{person.jid}</span>
        <span className="text-muted">
          → {mapped ? mapped.displayName : person.taskAccountId ?? "sin mapear"}
        </span>
      </div>
    );
  }

  return (
    <form
      className="border border-border-dark rounded p-3 flex items-end gap-3 flex-wrap"
      action={(fd) =>
        startTransition(async () => {
          const res = await savePerson(person.id, fd);
          setError(res.error ?? null);
          setSaved(!res.error);
        })
      }
    >
      <div className="min-w-44">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          WhatsApp
        </div>
        <div className="font-bold text-[14px]">{person.pushName || person.jid.split("@")[0]}</div>
        <div className="text-muted text-[11px]">{person.jid}</div>
      </div>
      <div className="w-44">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Nombre real
        </label>
        <input
          name="displayName"
          className="tdp-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={person.pushName || "Nombre"}
        />
      </div>
      <div className="w-56">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Usuario del gestor
        </label>
        {users.length > 0 ? (
          <select
            name="taskAccountId"
            className="tdp-input"
            value={taskAccountId}
            onChange={(e) => setTaskAccountId(e.target.value)}
          >
            <option value="">— sin asignar —</option>
            {/* Si el valor mapeado no está en la lista de usuarios, lo añadimos
                para que el select lo muestre igualmente (no revertir a "sin asignar"). */}
            {taskAccountId && !mapped && !users.some((u) => u.accountId === taskAccountId) && (
              <option value={taskAccountId}>{taskAccountId}</option>
            )}
            {users.map((u) => (
              <option key={u.accountId} value={u.accountId}>
                {u.displayName}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="taskAccountId"
            className="tdp-input"
            value={taskAccountId}
            onChange={(e) => setTaskAccountId(e.target.value)}
            placeholder="id / email del usuario"
          />
        )}
      </div>
      <div className="flex-1 min-w-40">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Alias en el chat
        </label>
        <input
          name="aliases"
          className="tdp-input"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="Rulo, el jefe…"
        />
      </div>
      <button type="submit" className="btn-primary !py-2 !px-3 text-[12px]" disabled={pending}>
        {pending ? "Guardando…" : saved ? "Guardado ✓" : "Guardar"}
      </button>
      {error && <span className="text-danger text-[12px] font-semibold w-full">{error}</span>}
    </form>
  );
}

export function AgentSettingsForm({ settings }: { settings: AgentSettings }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Controlados: React 19 resetea los <form action> al terminar; con estado el
  // valor guardado permanece visible (mismo criterio que el mapeo de personas).
  const [mode, setMode] = useState(settings.mode);
  const [debounceSeconds, setDebounceSeconds] = useState(String(settings.debounceSeconds));
  const [maxBatchWaitSeconds, setMaxBatchWaitSeconds] = useState(String(settings.maxBatchWaitSeconds));
  const [repliesEnabled, setRepliesEnabled] = useState(settings.repliesEnabled);

  return (
    <form
      className="flex items-end gap-3 flex-wrap"
      action={(fd) =>
        startTransition(async () => {
          const res = await saveAgentSettings(fd);
          setError(res.error ?? null);
          setSaved(!res.error);
        })
      }
    >
      <div className="w-44">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Modo
        </label>
        <select
          name="mode"
          className="tdp-input"
          value={mode}
          onChange={(e) => setMode(e.target.value as AgentSettings["mode"])}
        >
          <option value="shadow">Shadow (solo registra)</option>
          <option value="active">Activo (ejecuta)</option>
        </select>
      </div>
      <div className="w-36">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Silencio (s)
        </label>
        <input
          name="debounceSeconds"
          type="number"
          min={10}
          max={1800}
          value={debounceSeconds}
          onChange={(e) => setDebounceSeconds(e.target.value)}
          className="tdp-input"
          title="Segundos sin mensajes nuevos antes de procesar el lote"
        />
      </div>
      <div className="w-36">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Espera máx. (s)
        </label>
        <input
          name="maxBatchWaitSeconds"
          type="number"
          min={60}
          max={3600}
          value={maxBatchWaitSeconds}
          onChange={(e) => setMaxBatchWaitSeconds(e.target.value)}
          className="tdp-input"
          title="Tope desde el primer mensaje pendiente aunque sigan llegando"
        />
      </div>
      <label className="flex items-center gap-2 pb-2.5 text-[13px] font-semibold cursor-pointer">
        <input
          type="checkbox"
          name="repliesEnabled"
          checked={repliesEnabled}
          onChange={(e) => setRepliesEnabled(e.target.checked)}
        />
        Respuestas por WhatsApp
      </label>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Guardando…" : saved ? "Guardado ✓" : "Guardar ajustes"}
      </button>
      {error && <span className="text-danger text-sm font-semibold w-full">{error}</span>}
    </form>
  );
}

/**
 * Contexto y reglas del agente: texto libre que se inyecta en el prompt en CADA
 * ejecución. Editarlo aquí cambia el comportamiento del agente al instante, sin
 * redeploy. Campo controlado + guardado propio (no pisa los demás ajustes).
 */
export function AgentContextForm({ settings }: { settings: AgentSettings }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState(settings.extraInstructions ?? "");
  const dirty = text !== (settings.extraInstructions ?? "");

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const res = await saveAgentContext(fd);
          setError(res.error ?? null);
          setSaved(!res.error);
        })
      }
    >
      <p className="text-muted text-[13px] mb-3">
        Reglas y contexto del negocio para el agente. Se aplican en la próxima ejecución,{" "}
        <span className="text-text font-semibold">sin necesidad de redeploy</span>. Escribe las
        instrucciones en lenguaje natural, una por línea.
      </p>
      <textarea
        name="extraInstructions"
        className="tdp-input min-h-40 font-mono text-[13px] leading-relaxed"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder={
          "P. ej.:\n" +
          "- Las urgencias de tienda van siempre en prioridad Urgent.\n" +
          "- Los tickets de recambios llevan la etiqueta 'recambios'.\n" +
          "- Si Raúl dice 'para hoy', ponlo en prioridad High.\n" +
          "- No abras tickets de temas de marketing; esos los lleva otro equipo."
        }
      />
      <div className="flex items-center gap-3 mt-3">
        <button type="submit" className="btn-primary" disabled={pending || !dirty}>
          {pending ? "Guardando…" : saved ? "Guardado ✓" : "Guardar contexto"}
        </button>
        {dirty && !pending && <span className="text-warning text-[12px] font-semibold">Cambios sin guardar</span>}
        {error && <span className="text-danger text-sm font-semibold">{error}</span>}
      </div>
    </form>
  );
}
