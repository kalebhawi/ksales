import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, ChevronDown, ChevronRight, FileClock, LayoutDashboard, ListOrdered, ShieldCheck, UserCircle, Users } from "lucide-react";
import { AccountMenu } from "./account-menu";
import type { SessionUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/authz";
import { initialsOf } from "@/lib/format";
import { LogoutButton } from "./logout-button";

export type ShellSection = "overview" | "queue" | "sellers" | "supervisors" | "audit" | "profile";

export function AppShell({
  user,
  section,
  breadcrumb,
  queueCount,
  children,
}: {
  user: SessionUser;
  section: ShellSection;
  breadcrumb: string;
  queueCount?: number;
  children: ReactNode;
}) {
  const initials = initialsOf(user.name);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">k</span>
          <span>kalebhawi</span>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-dot" /> Operação comercial <ChevronDown size={14} />
        </div>
        <nav className="main-nav">
          <p className="nav-label">Operação</p>
          {user.canViewDashboard && (
            <Link className={`nav-item ${section === "overview" ? "active" : ""}`} href="/">
              <LayoutDashboard size={18} /> Visão geral
            </Link>
          )}
          <Link className={`nav-item ${section === "queue" ? "active" : ""}`} href="/fila">
            <ListOrdered size={18} /> Fila de vendedores
            {queueCount !== undefined && <span className="nav-count">{queueCount}</span>}
          </Link>

          <p className="nav-label nav-label-spaced">Gerenciar</p>
          {user.canManageRegistry && (
            <Link className={`nav-item ${section === "sellers" ? "active" : ""}`} href="/admin/vendedores">
              <Users size={18} /> Vendedores
            </Link>
          )}
          {user.canManageSupervisors && (
            <Link className={`nav-item ${section === "supervisors" ? "active" : ""}`} href="/admin/supervisores">
              <ShieldCheck size={18} /> Supervisores
            </Link>
          )}
          {user.canDownloadAuditLog && (
            <Link className={`nav-item ${section === "audit" ? "active" : ""}`} href="/admin/auditoria">
              <FileClock size={18} /> Auditoria
            </Link>
          )}
          <Link className={`nav-item ${section === "profile" ? "active" : ""}`} href="/perfil">
            <UserCircle size={18} /> Meu perfil
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="mini-avatar coral">{initials}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={15} />
            <strong>{breadcrumb}</strong>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notificações">
              <Bell size={18} />
              <i />
            </button>
            <AccountMenu name={user.name} initials={initials} role={ROLE_LABELS[user.role]} />
          </div>
        </header>
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
