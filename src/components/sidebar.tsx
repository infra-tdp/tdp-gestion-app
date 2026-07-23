"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  Boxes,
  ChevronRight,
  GitPullRequest,
  KeyRound,
  LayoutDashboard,
  Lock,
  MessageCircle,
  Network,
  Radio,
  Server,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Logo } from "./logo";

export const ICONS = {
  dashboard: LayoutDashboard,
  server: Server,
  workflow: Workflow,
  radio: Radio,
  apps: Boxes,
  staging: GitPullRequest,
  users: Users,
  roles: ShieldCheck,
  keys: KeyRound,
  bot: Bot,
  bell: Bell,
  whatsapp: MessageCircle,
  infra: Network,
  security: Lock,
};

export type IconKey = keyof typeof ICONS;

/** Hoja de navegación (enlace a una página). */
export type NavLeaf = {
  href: string;
  label: string;
  icon?: IconKey;
  /** Permiso requerido (lo filtra el layout en el servidor). */
  permission?: string;
  /** Marcador para pintar el contador de no leídas. */
  badge?: "notifications";
};
/** Grupo plegable con hijos (hojas u otros grupos). Árbol de profundidad libre. */
export type NavGroup = { label: string; icon?: IconKey; children: NavNode[] };
export type NavNode = NavLeaf | NavGroup;

const isGroup = (n: NavNode): n is NavGroup => "children" in n;

function isActiveHref(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
/** ¿Algún enlace descendiente del nodo es la ruta activa? (para auto-abrir/resaltar) */
function containsActive(node: NavNode, pathname: string): boolean {
  return isGroup(node)
    ? node.children.some((c) => containsActive(c, pathname))
    : isActiveHref(node.href, pathname);
}

export function Sidebar({
  items,
  userName,
  userRole,
  unread,
  logout,
}: {
  items: NavNode[];
  userName: string;
  userRole: string;
  unread: number;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  // Estado de plegado por id de grupo. undefined = usar el default (abierto si
  // contiene la ruta activa). Persiste entre navegaciones (el layout no se
  // desmonta) y entre recargas (localStorage).
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tdp-nav-open");
      if (raw) setOpenState(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = (id: string, defOpen: boolean) =>
    setOpenState((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? defOpen) };
      try {
        localStorage.setItem("tdp-nav-open", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-bg border-r border-border-dark">
      <div className="px-5 py-5 border-b border-border-dark">
        <Link href="/">
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map((node) => (
          <NavRow
            key={isGroup(node) ? "g:" + node.label : node.href}
            node={node}
            depth={0}
            path={isGroup(node) ? node.label : node.href}
            pathname={pathname}
            openState={openState}
            toggle={toggle}
            unread={unread}
          />
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-border-dark">
        <div className="text-[13px] font-semibold">{userName}</div>
        <div className="text-muted text-[11px] uppercase tracking-wider">{userRole}</div>
        <form action={logout}>
          <button className="text-muted text-[12px] mt-2 hover:text-danger cursor-pointer" type="submit">
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavRow({
  node,
  depth,
  path,
  pathname,
  openState,
  toggle,
  unread,
}: {
  node: NavNode;
  depth: number;
  path: string;
  pathname: string;
  openState: Record<string, boolean>;
  toggle: (id: string, defOpen: boolean) => void;
  unread: number;
}) {
  // Sangría por nivel; el icono ocupa el hueco cuando existe.
  const pad = 20 + depth * 14;
  const Icon = node.icon ? ICONS[node.icon] : null;

  if (isGroup(node)) {
    const active = containsActive(node, pathname);
    const open = openState[path] ?? active; // abierto por defecto si contiene la activa
    return (
      <div>
        <button
          type="button"
          onClick={() => toggle(path, active)}
          aria-expanded={open}
          style={{ paddingLeft: pad }}
          className={`w-full flex items-center gap-2.5 pr-4 py-2.5 text-[14px] font-semibold transition-colors cursor-pointer border-l-2 ${
            active && !open
              ? "text-primary border-primary"
              : "text-text border-transparent hover:text-primary"
          }`}
        >
          {Icon && <Icon size={17} className="shrink-0" />}
          <span className="truncate text-left flex-1">{node.label}</span>
          <ChevronRight
            size={15}
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
        {open && (
          <div>
            {node.children.map((child) => (
              <NavRow
                key={isGroup(child) ? "g:" + child.label : child.href}
                node={child}
                depth={depth + 1}
                path={path + "/" + (isGroup(child) ? child.label : child.href)}
                pathname={pathname}
                openState={openState}
                toggle={toggle}
                unread={unread}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const active = isActiveHref(node.href, pathname);
  return (
    <Link
      href={node.href}
      style={{ paddingLeft: pad }}
      className={`flex items-center gap-2.5 pr-4 py-2.5 text-[14px] font-semibold transition-colors border-l-2 ${
        active
          ? "text-primary border-primary bg-bg-tertiary"
          : "text-text border-transparent hover:text-primary"
      }`}
    >
      {Icon ? <Icon size={17} className="shrink-0" /> : <span className="w-[17px] shrink-0" />}
      <span className="truncate">{node.label}</span>
      {node.badge === "notifications" && unread > 0 && (
        <span className="ml-auto badge badge-success">{unread}</span>
      )}
    </Link>
  );
}
