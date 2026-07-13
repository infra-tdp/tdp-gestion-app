"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  GitPullRequest,
  KeyRound,
  LayoutDashboard,
  Radio,
  Server,
  Users,
  Workflow,
} from "lucide-react";
import { Logo } from "./logo";

type Item = { href: string; label: string; icon: keyof typeof ICONS; permission?: string };

const ICONS = {
  dashboard: LayoutDashboard,
  server: Server,
  workflow: Workflow,
  radio: Radio,
  staging: GitPullRequest,
  users: Users,
  keys: KeyRound,
  bot: Bot,
  bell: Bell,
};

export function Sidebar({
  items,
  userName,
  userRole,
  unread,
  logout,
}: {
  items: Item[];
  userName: string;
  userRole: string;
  unread: number;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-bg border-r border-border-dark">
      <div className="px-5 py-5 border-b border-border-dark">
        <Link href="/">
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-[14px] font-semibold transition-colors ${
                active
                  ? "text-primary border-l-2 border-primary bg-bg-tertiary"
                  : "text-text border-l-2 border-transparent hover:text-primary"
              }`}
            >
              <Icon size={17} />
              {item.label}
              {item.href === "/notificaciones" && unread > 0 && (
                <span className="ml-auto badge badge-success">{unread}</span>
              )}
            </Link>
          );
        })}
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
