"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "¿Está todo operativo ahora mismo?",
  "¿Qué entornos de staging hay activos y de quién son?",
  "Resume las últimas ejecuciones de tofu",
  "¿Ha habido caídas en las últimas 24 horas?",
];

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error ?? "Error inesperado");
      setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tdp-card !p-0 flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="text-center pt-10">
            <p className="text-muted text-sm mb-4">
              Consulta el estado real de la infraestructura: el asistente usa herramientas sobre monitores, nodos,
              stagings y runs de tofu.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn-dark text-[13px]" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-[4px] px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-primary text-bg font-semibold" : "bg-bg-tertiary border border-border-dark"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-muted text-sm animate-pulse">Consultando la infraestructura…</div>}
        {error && <div className="text-danger text-sm font-semibold">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <form
        className="border-t border-border-dark p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="tdp-input"
          placeholder="Pregunta lo que quieras sobre la infraestructura…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="btn-primary shrink-0 uppercase" disabled={busy || !input.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
