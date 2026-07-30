"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CornerDownRight, RotateCcw } from "lucide-react";
import { resetNav, saveNav } from "@/lib/actions/nav";
import { ICONS, type IconKey } from "@/components/sidebar";
import type { NavDef, NavOverrides } from "@/lib/nav";

const NAV_ROOT = "__root"; // debe coincidir con NAV_ROOT de @/lib/nav (server-only)

const isGroup = (n: NavDef): n is Extract<NavDef, { children: NavDef[] }> => "children" in n;

/** Mismo criterio de ordenación que aplica el servidor en applyNavOverrides. */
function orderChildren(nodes: NavDef[], parentId: string, order: Record<string, string[]>): NavDef[] {
  const ids = order[parentId];
  if (!ids?.length) return nodes;
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...nodes].sort((a, b) => {
    const pa = pos.get(a.id) ?? ids.length + nodes.indexOf(a);
    const pb = pos.get(b.id) ?? ids.length + nodes.indexOf(b);
    return pa - pb;
  });
}

export function NavEditor({ tree, initial }: { tree: NavDef[]; initial: NavOverrides }) {
  const [labels, setLabels] = useState<Record<string, string>>(initial.labels ?? {});
  const [order, setOrder] = useState<Record<string, string[]>>(initial.order ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Tras un guardado/reset el servidor re-renderiza con la versión persistida:
  // re-sincronizamos el estado local (p.ej. para que "Restablecer" se refleje).
  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);
  useEffect(() => {
    const iv = JSON.parse(initialJson) as NavOverrides;
    setLabels(iv.labels ?? {});
    setOrder(iv.order ?? {});
  }, [initialJson]);

  const persist = (nextLabels: Record<string, string>, nextOrder: Record<string, string[]>) =>
    startTransition(async () => {
      const res = await saveNav({ labels: nextLabels, order: nextOrder });
      setError(res.error ?? null);
    });

  const rename = (id: string, value: string) =>
    setLabels((prev) => {
      const next = { ...prev };
      if (value.trim()) next[id] = value;
      else delete next[id];
      return next;
    });

  const move = (parentId: string, siblings: NavDef[], id: string, dir: -1 | 1) => {
    const current = orderChildren(siblings, parentId, order).map((n) => n.id);
    const i = current.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= current.length) return;
    [current[i], current[j]] = [current[j], current[i]];
    const nextOrder = { ...order, [parentId]: current };
    setOrder(nextOrder);
    persist(labels, nextOrder);
  };

  return (
    <div className="tdp-card-plain p-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-dark">
        <span className="text-muted text-[12px]">
          {pending ? "Guardando…" : "Los cambios se guardan automáticamente."}
        </span>
        {error && <span className="text-danger text-[12px] font-semibold">{error}</span>}
      </div>
      <div className="py-2">
        <Rows
          nodes={tree}
          parentId={NAV_ROOT}
          depth={0}
          labels={labels}
          order={order}
          onRename={rename}
          onBlurPersist={() => persist(labels, order)}
          onMove={move}
        />
      </div>
    </div>
  );
}

function Rows({
  nodes,
  parentId,
  depth,
  labels,
  order,
  onRename,
  onBlurPersist,
  onMove,
}: {
  nodes: NavDef[];
  parentId: string;
  depth: number;
  labels: Record<string, string>;
  order: Record<string, string[]>;
  onRename: (id: string, value: string) => void;
  onBlurPersist: () => void;
  onMove: (parentId: string, siblings: NavDef[], id: string, dir: -1 | 1) => void;
}) {
  const ordered = orderChildren(nodes, parentId, order);
  return (
    <>
      {ordered.map((node, i) => {
        const Icon = node.icon ? ICONS[node.icon as IconKey] : null;
        const custom = labels[node.id] ?? "";
        return (
          <div key={node.id}>
            <div
              className="flex items-center gap-2.5 pr-4 py-1.5 hover:bg-bg-tertiary/40"
              style={{ paddingLeft: 16 + depth * 22 }}
            >
              {depth > 0 && <CornerDownRight size={13} className="text-muted shrink-0" />}
              {Icon ? <Icon size={16} className="shrink-0 text-muted" /> : <span className="w-4 shrink-0" />}
              <div className="flex-1 min-w-0 flex items-center gap-2.5 flex-wrap">
                <input
                  className="tdp-input !w-56 !py-1 text-[13px]"
                  value={custom}
                  placeholder={node.label}
                  maxLength={60}
                  onChange={(e) => onRename(node.id, e.target.value)}
                  onBlur={onBlurPersist}
                  title={custom ? `Nombre original: ${node.label}` : "Escribe para renombrar"}
                />
                <span className="text-muted text-[11px] truncate">
                  {custom && custom !== node.label && <>era «{node.label}» · </>}
                  {isGroup(node) ? "grupo" : node.href}
                </span>
              </div>
              <div className="inline-flex gap-1 shrink-0">
                <button
                  type="button"
                  className="btn-dark !p-1.5"
                  disabled={i === 0}
                  title="Subir"
                  onClick={() => onMove(parentId, nodes, node.id, -1)}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className="btn-dark !p-1.5"
                  disabled={i === ordered.length - 1}
                  title="Bajar"
                  onClick={() => onMove(parentId, nodes, node.id, 1)}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
            </div>
            {isGroup(node) && (
              <Rows
                nodes={node.children}
                parentId={node.id}
                depth={depth + 1}
                labels={labels}
                order={order}
                onRename={onRename}
                onBlurPersist={onBlurPersist}
                onMove={onMove}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function ResetNavButton() {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button
        className="btn-dark !py-1.5 !px-3 text-[13px] inline-flex items-center gap-1.5"
        onClick={() => setConfirm(true)}
      >
        <RotateCcw size={13} /> Restablecer
      </button>
    );
  }
  return (
    <span className="inline-flex gap-2 items-center">
      <span className="text-muted text-[13px]">¿Volver al menú por defecto?</span>
      <button
        className="btn-danger !py-1.5 !px-3 text-[13px]"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await resetNav();
            setConfirm(false);
          })
        }
      >
        Sí
      </button>
      <button className="btn-dark !py-1.5 !px-3 text-[13px]" onClick={() => setConfirm(false)}>
        No
      </button>
    </span>
  );
}
