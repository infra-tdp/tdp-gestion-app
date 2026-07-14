"use client";

import { useState, useTransition } from "react";
import { resetRoles, savePermission } from "@/lib/actions/roles";
import type { Role } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/rbac";

type Row = { permission: Permission; label: string; locked: boolean; roles: string[] };
type ModuleGroup = { module: string; rows: Row[] };

export function RoleMatrix({ roles, modules }: { roles: Role[]; modules: ModuleGroup[] }) {
  // Estado local: permission -> Set<role> (optimista).
  const [state, setState] = useState<Record<string, Set<string>>>(() => {
    const s: Record<string, Set<string>> = {};
    for (const m of modules) for (const r of m.rows) s[r.permission] = new Set(r.roles);
    return s;
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (permission: Permission, role: Role, checked: boolean) => {
    setError(null);
    setState((prev) => {
      const next = { ...prev, [permission]: new Set(prev[permission]) };
      if (checked) next[permission].add(role);
      else next[permission].delete(role);
      return next;
    });
    startTransition(async () => {
      const res = await savePermission(permission, role, checked);
      if (res.error) {
        setError(res.error);
        // revertir el cambio optimista
        setState((prev) => {
          const next = { ...prev, [permission]: new Set(prev[permission]) };
          if (checked) next[permission].delete(role);
          else next[permission].add(role);
          return next;
        });
      }
    });
  };

  return (
    <div className="tdp-card-plain p-0 overflow-x-auto">
      {error && <div className="text-danger text-sm font-semibold px-4 pt-3">{error}</div>}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border-dark">
            <th className="text-left font-bold p-3 min-w-72">Acción</th>
            {roles.map((r) => (
              <th key={r} className="text-center font-bold p-3 w-24 uppercase tracking-wider text-[12px]">
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <ModuleRows key={m.module} group={m} roles={roles} state={state} toggle={toggle} pending={pending} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModuleRows({
  group,
  roles,
  state,
  toggle,
  pending,
}: {
  group: ModuleGroup;
  roles: Role[];
  state: Record<string, Set<string>>;
  toggle: (p: Permission, r: Role, checked: boolean) => void;
  pending: boolean;
}) {
  return (
    <>
      <tr className="bg-bg-tertiary">
        <td colSpan={roles.length + 1} className="px-3 py-1.5 text-primary font-bold text-[12px] uppercase tracking-wider">
          {group.module}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.permission} className="border-b border-border-dark/60 hover:bg-bg-tertiary/40">
          <td className="p-3">
            <div className="font-semibold">{row.label}</div>
            <code className="text-muted text-[11px]">{row.permission}</code>
          </td>
          {roles.map((role) => {
            const fixed = role === "ADMIN" || row.locked; // ADMIN siempre; bloqueados no editables
            const checked = role === "ADMIN" ? true : state[row.permission]?.has(role) ?? false;
            return (
              <td key={role} className="text-center p-3">
                <input
                  type="checkbox"
                  className="tdp-check"
                  checked={checked}
                  disabled={fixed || pending}
                  title={fixed ? "Fijo (ADMIN / permiso bloqueado)" : undefined}
                  onChange={(e) => toggle(row.permission, role, e.target.checked)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

export function ResetRolesButton() {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button className="btn-dark !py-1.5 !px-3 text-[13px]" onClick={() => setConfirm(true)}>
        Restablecer por defecto
      </button>
    );
  }
  return (
    <span className="inline-flex gap-2 items-center">
      <span className="text-muted text-[13px]">¿Seguro?</span>
      <button
        className="btn-danger !py-1.5 !px-3 text-[13px]"
        disabled={pending}
        onClick={() => startTransition(() => resetRoles())}
      >
        Sí, restablecer
      </button>
      <button className="btn-dark !py-1.5 !px-3 text-[13px]" onClick={() => setConfirm(false)}>
        No
      </button>
    </span>
  );
}
