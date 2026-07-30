"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Lock, Pencil, Search, Trash2, X } from "lucide-react";
import {
  createRoleAction,
  deleteRoleAction,
  resetRoles,
  savePermission,
  updateRoleAction,
} from "@/lib/actions/roles";
import type { Permission } from "@/lib/auth/rbac";

export type RoleView = {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  users: number;
};

/* ------------------------------ Gestor de roles --------------------------- */

export function RoleManager({ roles }: { roles: RoleView[] }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      {error && <div className="text-danger text-sm font-semibold mb-3">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mb-4">
        {roles.map((r) => (
          <RoleCard key={r.key} role={r} onError={setError} />
        ))}
      </div>
      <CreateRoleForm roles={roles} onError={setError} />
    </div>
  );
}

function RoleCard({ role, onError }: { role: RoleView; onError: (e: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");

  const save = () =>
    startTransition(async () => {
      const res = await updateRoleAction(role.key, name, description);
      onError(res.error ?? null);
      if (!res.error) setEditing(false);
    });

  const remove = () =>
    startTransition(async () => {
      const res = await deleteRoleAction(role.key);
      onError(res.error ?? null);
      setConfirmDelete(false);
    });

  return (
    <div className="tdp-card-plain p-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-outline font-mono">{role.key}</span>
        {role.isSystem && (
          <span className="badge badge-success inline-flex items-center gap-1">
            <Lock size={11} /> Sistema
          </span>
        )}
        <span className="text-muted text-[12px] ml-auto">
          {role.users} usuario{role.users === 1 ? "" : "s"}
        </span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            className="tdp-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del rol"
          />
          <input
            className="tdp-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
          />
          <div className="flex gap-2">
            <button className="btn-primary !py-1 !px-3 text-[12px]" disabled={pending} onClick={save}>
              Guardar
            </button>
            <button
              className="btn-dark !py-1 !px-3 text-[12px]"
              onClick={() => {
                setEditing(false);
                setName(role.name);
                setDescription(role.description ?? "");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="font-semibold mt-2">{role.name}</div>
          {role.description && <div className="text-muted text-[12px] mt-0.5">{role.description}</div>}
          {role.isSystem ? (
            <div className="text-muted text-[12px] mt-2">
              Solo lectura: tiene <b>todos</b> los permisos, también los que se creen en el futuro.
            </div>
          ) : (
            <div className="flex gap-1.5 mt-3">
              <button
                className="btn-dark !py-1 !px-2.5 text-[12px] inline-flex items-center gap-1"
                onClick={() => setEditing(true)}
              >
                <Pencil size={12} /> Editar
              </button>
              {confirmDelete ? (
                <span className="inline-flex items-center gap-1.5">
                  <button className="btn-danger !py-1 !px-2.5 text-[12px]" disabled={pending} onClick={remove}>
                    Sí, borrar
                  </button>
                  <button className="btn-dark !py-1 !px-2.5 text-[12px]" onClick={() => setConfirmDelete(false)}>
                    No
                  </button>
                </span>
              ) : (
                <button
                  className="btn-dark !py-1 !px-2.5 text-[12px] inline-flex items-center gap-1 hover:!text-danger"
                  onClick={() => setConfirmDelete(true)}
                  title={role.users > 0 ? "Reasigna sus usuarios antes de borrar" : "Borrar rol"}
                >
                  <Trash2 size={12} /> Borrar
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreateRoleForm({ roles, onError }: { roles: RoleView[]; onError: (e: string | null) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      ref={formRef}
      className="flex items-end gap-3 flex-wrap border-t border-border-dark pt-4"
      action={(fd) =>
        startTransition(async () => {
          const res = await createRoleAction(fd);
          onError(res.error ?? null);
          if (!res.error) formRef.current?.reset();
        })
      }
    >
      <div className="w-40">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Clave</label>
        <input
          name="key"
          className="tdp-input uppercase"
          placeholder="TALLER"
          pattern="[A-Za-z][A-Za-z0-9_]{1,29}"
          title="MAYÚSCULAS, números y _ (2-30 caracteres)"
          required
        />
      </div>
      <div className="flex-1 min-w-44">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">Nombre</label>
        <input name="name" className="tdp-input" placeholder="Técnicos del taller" required />
      </div>
      <div className="flex-1 min-w-52">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Descripción
        </label>
        <input name="description" className="tdp-input" placeholder="Opcional" />
      </div>
      <div className="w-48">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">
          Copiar permisos de
        </label>
        <select name="copyFrom" className="tdp-input" defaultValue="">
          <option value="">— Empezar sin permisos —</option>
          {roles
            .filter((r) => r.key !== "ADMIN")
            .map((r) => (
              <option key={r.key} value={r.key}>
                {r.key} — {r.name}
              </option>
            ))}
        </select>
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creando…" : "Crear rol"}
      </button>
    </form>
  );
}

/* ------------------------------ Matriz de permisos ------------------------ */

type Row = { permission: Permission; label: string; sensitive: boolean; roles: string[] };
type ModuleGroup = { module: string; rows: Row[] };

/** Para buscar sin distinguir mayúsculas ni acentos ("gestion" ≈ "Gestión"). */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function RoleMatrix({ roles, modules }: { roles: RoleView[]; modules: ModuleGroup[] }) {
  // Estado local: permission -> Set<roleKey> (optimista).
  const [state, setState] = useState<Record<string, Set<string>>>(() => {
    const s: Record<string, Set<string>> = {};
    for (const m of modules) for (const r of m.rows) s[r.permission] = new Set(r.roles);
    return s;
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Buscador: si coincide el nombre del módulo se muestra entero; si no, solo
  // las acciones cuyo nombre o clave de permiso contengan el texto.
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return modules;
    return modules
      .map((m) =>
        norm(m.module).includes(q)
          ? m
          : { ...m, rows: m.rows.filter((r) => norm(r.label).includes(q) || norm(r.permission).includes(q)) },
      )
      .filter((m) => m.rows.length > 0);
  }, [modules, query]);
  const totalRows = modules.reduce((n, m) => n + m.rows.length, 0);
  const shownRows = filtered.reduce((n, m) => n + m.rows.length, 0);

  const toggle = (permission: Permission, roleKey: string, checked: boolean) => {
    setError(null);
    setState((prev) => {
      const next = { ...prev, [permission]: new Set(prev[permission]) };
      if (checked) next[permission].add(roleKey);
      else next[permission].delete(roleKey);
      return next;
    });
    startTransition(async () => {
      const res = await savePermission(permission, roleKey, checked);
      if (res.error) {
        setError(res.error);
        // revertir el cambio optimista
        setState((prev) => {
          const next = { ...prev, [permission]: new Set(prev[permission]) };
          if (checked) next[permission].delete(roleKey);
          else next[permission].add(roleKey);
          return next;
        });
      }
    });
  };

  return (
    <div className="tdp-card-plain p-0 overflow-x-auto">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-dark flex-wrap">
        <div className="relative flex-1 min-w-56 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            className="tdp-input !pl-8 !pr-8 !py-1.5 text-[13px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por módulo, acción o permiso… (p.ej. staging)"
            aria-label="Filtrar la matriz de permisos"
          />
          {query && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text cursor-pointer"
              onClick={() => setQuery("")}
              title="Limpiar filtro"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-muted text-[12px]">
          {query ? `${shownRows} de ${totalRows} acciones` : `${totalRows} acciones`}
        </span>
      </div>
      {error && <div className="text-danger text-sm font-semibold px-4 pt-3">{error}</div>}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border-dark">
            <th className="text-left font-bold p-3 min-w-72">Acción</th>
            {roles.map((r) => (
              <th
                key={r.key}
                className="text-center font-bold p-3 w-24 uppercase tracking-wider text-[12px]"
                title={r.name}
              >
                <span className="inline-flex items-center gap-1">
                  {r.isSystem && <Lock size={11} className="text-primary" />}
                  {r.key}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => (
            <ModuleRows key={m.module} group={m} roles={roles} state={state} toggle={toggle} pending={pending} />
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={roles.length + 1} className="p-6 text-center text-muted">
                Sin resultados para «{query}» — prueba con el nombre del módulo (Staging, OpenTofu…) o la clave
                del permiso.
              </td>
            </tr>
          )}
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
  roles: RoleView[];
  state: Record<string, Set<string>>;
  toggle: (p: Permission, roleKey: string, checked: boolean) => void;
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
            const fixed = role.key === "ADMIN"; // ADMIN siempre tiene todo (solo lectura)
            const checked = role.key === "ADMIN" ? true : state[row.permission]?.has(role.key) ?? false;
            const warn = row.sensitive && checked && role.key !== "ADMIN";
            return (
              <td key={role.key} className="text-center p-3">
                <span className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="tdp-check"
                    checked={checked}
                    disabled={fixed || pending}
                    title={fixed ? "Fijo: ADMIN siempre tiene todos los permisos" : undefined}
                    onChange={(e) => toggle(row.permission, role.key, e.target.checked)}
                  />
                  {warn && (
                    <AlertTriangle
                      size={14}
                      className="text-warning shrink-0"
                      aria-label="Permiso sensible concedido a un rol que no es ADMIN"
                    >
                      <title>
                        Permiso sensible: este rol podrá gestionar usuarios/roles y ampliar sus propios permisos.
                      </title>
                    </AlertTriangle>
                  )}
                </span>
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
      <span className="text-muted text-[13px]">¿Seguro? Los roles personalizados quedarán sin permisos.</span>
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
