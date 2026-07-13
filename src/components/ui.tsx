import type { ReactNode } from "react";

/** Primitivas de UI según la guía TDP — ver globals.css para los tokens. */

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div>
        {eyebrow && (
          <div className="text-primary font-bold text-[13px] uppercase tracking-wider mb-1">{eyebrow}</div>
        )}
        <h1 className="headline text-4xl md:text-5xl text-text leading-none">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  accent = true,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return <div className={`${accent ? "tdp-card" : "tdp-card-plain"} p-5 ${className}`}>{children}</div>;
}

export function Kpi({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const color =
    tone === "success" ? "text-primary" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-text";
  return (
    <div className="tdp-card p-5">
      <div className="text-muted text-[12px] font-semibold uppercase tracking-wider">{label}</div>
      <div className={`headline text-4xl mt-1 ${color}`}>{value}</div>
      {detail && <div className="text-muted text-[13px] mt-1">{detail}</div>}
    </div>
  );
}

type BadgeTone = "success" | "danger" | "warning" | "neutral" | "outline";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusDot({ ok }: { ok: boolean | null }) {
  const color = ok === null ? "#444444" : ok ? "#5DFF00" : "#FF3700";
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: 10, height: 10, backgroundColor: color, boxShadow: ok ? `0 0 6px ${color}` : "none" }}
    />
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="tdp-card-plain p-10 text-center">
      <div className="headline text-2xl text-muted">{title}</div>
      {detail && <div className="text-muted text-sm mt-2 max-w-md mx-auto">{detail}</div>}
    </div>
  );
}

/** Mapea estados de staging/runs a badges coherentes en toda la app. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    // staging
    pending: { tone: "neutral", label: "Pendiente" },
    provisioning: { tone: "warning", label: "Provisionando" },
    active: { tone: "success", label: "Activo" },
    error: { tone: "danger", label: "Error" },
    destroying: { tone: "warning", label: "Destruyendo" },
    destroyed: { tone: "outline", label: "Destruido" },
    // runs tofu
    queued: { tone: "neutral", label: "En cola" },
    running: { tone: "warning", label: "Ejecutando" },
    success: { tone: "success", label: "OK" },
    // nodos upcloud
    started: { tone: "success", label: "Encendido" },
    stopped: { tone: "outline", label: "Apagado" },
    maintenance: { tone: "warning", label: "Mantenimiento" },
  };
  const entry = map[status] ?? { tone: "neutral" as BadgeTone, label: status };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return `hace ${seconds}s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)}h`;
  return `hace ${Math.floor(seconds / 86400)}d`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
}
