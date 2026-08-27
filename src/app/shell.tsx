import type { ReactNode } from "react";
import Link from "next/link";
import { FileClock, LayoutDashboard, ListOrdered, ShieldCheck, Store, UserCircle, Users } from "lucide-react";
import { AccountMenu } from "./account-menu";
import { AppLoadingProvider } from "./app-loading";
import { NavHint } from "./nav-hint";
import type { SessionUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/authz";
import { initialsOf } from "@/lib/format";
import { loadSessionPhoto } from "@/lib/profile";
import { loadStoreContext } from "@/lib/stores";
import { LogoutButton } from "./logout-button";
import { StoreSwitcher } from "./store-switcher";

export type ShellSection = "overview" | "queue" | "sellers" | "supervisors" | "stores" | "audit" | "profile";

export async function AppShell({
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
  const [photo, storeContext] = await Promise.all([loadSessionPhoto(user), loadStoreContext(user)]);

  return (
    <AppLoadingProvider>
      <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">k</span>
          <span>kalebhawi</span>
        </div>
        <StoreSwitcher
          stores={storeContext.stores}
          activeStoreId={storeContext.active?.id ?? null}
          canSwitch={storeContext.canSwitch}
        />
        <nav className="main-nav">
          <p className="nav-label">Operação</p>
          {user.canViewDashboard && (
            <Link className={`nav-item ${section === "overview" ? "active" : ""}`} href="/">
              <LayoutDashboard size={18} /> Visão geral
              <NavHint />
            </Link>
          )}
          <Link className={`nav-item ${section === "queue" ? "active" : ""}`} href="/fila">
            <ListOrdered size={18} /> Fila de vendedores
            {queueCount !== undefined && <span className="nav-count">{queueCount}</span>}
            <NavHint />
          </Link>

          <p className="nav-label nav-label-spaced">Gerenciar</p>
          {user.canManageRegistry && (
            <Link className={`nav-item ${section === "sellers" ? "active" : ""}`} href="/admin/vendedores">
              <Users size={18} /> Vendedores
              <NavHint />
            </Link>
          )}
          {user.canManageSupervisors && (
            <Link className={`nav-item ${section === "supervisors" ? "active" : ""}`} href="/admin/supervisores">
              <ShieldCheck size={18} /> Supervisores
              <NavHint />
            </Link>
          )}
          {user.canManageStores && (
            <Link className={`nav-item ${section === "stores" ? "active" : ""}`} href="/admin/lojas">
              <Store size={18} /> Lojas
              <NavHint />
            </Link>
          )}
          {user.canDownloadAuditLog && (
            <Link className={`nav-item ${section === "audit" ? "active" : ""}`} href="/admin/auditoria">
              <FileClock size={18} /> Auditoria
              <NavHint />
            </Link>
          )}
          <Link className={`nav-item ${section === "profile" ? "active" : ""}`} href="/perfil">
            <UserCircle size={18} /> Meu perfil
            <NavHint />
          </Link>
        </nav>
        <div className="sidebar-footer">
          <MiniAvatar photo={photo} initials={initials} tone="coral" />
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
            <strong>{breadcrumb}</strong>
          </div>
          <div className="top-actions">
            <AccountMenu name={user.name} initials={initials} role={ROLE_LABELS[user.role]} photo={photo} />
          </div>
        </header>
        <div className="content-wrap">{children}</div>
      </main>
      </div>
    </AppLoadingProvider>
  );
}

/**
 * Sem next/image de propósito: a foto enviada vem de rota autenticada, e o
 * otimizador do Next a buscaria a partir do servidor, sem o cookie — levaria 401.
 */
function MiniAvatar({ photo, initials, tone }: { photo: string | null; initials: string; tone: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="mini-avatar photo" src={photo} alt="" />;
  }

  return <div className={`mini-avatar ${tone}`}>{initials}</div>;
}
