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
  ListTree,
  Lock,
  MessageCircle,
  Network,
  Radio,
  Server,
  ShieldCheck,
  UserRound,
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
  menu: ListTree,
  user: UserRound,
};

export type IconKey = keyof typeof ICONS;

/** Hoja de navegación (enlace a una página). */
export type NavLeaf = {
  /** Id estable del nodo (clave de la personalización del menú). */
  id: string;
  href: string;
  label: string;
  icon?: IconKey;
  /** Permiso requerido (lo filtra el layout en el servidor). */
  permission?: string;
  /** Marcador para pintar el contador de no leídas. */
  badge?: "notifications";
};
/** Grupo plegable con hijos (hojas u otros grupos). Árbol de profundidad libre. */
export type NavGroup = { id: string; label: string; icon?: IconKey; children: NavNode[] };
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
  // Estado de plegado por id de grupo. undefined = usar el default: ABIERTO
  // solo si contiene la ruta activa. El acordeón SIEMPRE arranca plegado y en
  // cada navegación se vuelve al default, de modo que solo queda expandida la
  // cadena de la página actual (el grupo activo y sus padres).
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenState({});
  }, [pathname]);
  const toggle = (id: string, defOpen: boolean) =>
    setOpenState((prev) => ({ ...prev, [id]: !(prev[id] ?? defOpen) }));

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
            key={node.id}
            node={node}
            depth={0}
            pathname={pathname}
            openState={openState}
            toggle={toggle}
            unread={unread}
          />
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-border-dark">
        <Link href="/settings/seguridad" className="block group" title="Seguridad de tu cuenta">
          <div className="text-[13px] font-semibold group-hover:text-primary transition-colors">{userName}</div>
          <div className="text-muted text-[11px] uppercase tracking-wider">{userRole}</div>
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <Link href="/settings/seguridad" className="text-muted text-[12px] hover:text-primary">
            Mi perfil
          </Link>
          <form action={logout}>
            <button className="text-muted text-[12px] hover:text-danger cursor-pointer" type="submit">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function NavRow({
  node,
  depth,
  pathname,
  openState,
  toggle,
  unread,
}: {
  node: NavNode;
  depth: number;
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
    const open = openState[node.id] ?? active; // solo la cadena activa arranca abierta
    return (
      <div>
        <button
          type="button"
          onClick={() => toggle(node.id, active)}
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
                key={child.id}
                node={child}
                depth={depth + 1}
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
