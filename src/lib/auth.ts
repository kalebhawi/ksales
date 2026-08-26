import { cache } from "react";
import type { Actor, Role } from "@/lib/authz";
import {
  canManageSellerRegistry,
  canDownloadAuditLog,
  canManageSupervisors,
  canSuperviseQueue,
  canViewDashboard,
  isAdmin,
  primaryRole,
} from "@/lib/authz";
import { readSession } from "@/lib/session";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  sellerId: string | null;
  sellerName: string | null;
  role: Role;
  isAdmin: boolean;
  canViewDashboard: boolean;
  canSuperviseQueue: boolean;
  canManageRegistry: boolean;
  canManageSupervisors: boolean;
  canDownloadAuditLog: boolean;
  mustChangePassword: boolean;
};

/**
 * Fonte única da sessão no servidor. `cache` deduplica a consulta dentro da
 * mesma requisição, então páginas e route handlers podem chamar à vontade.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const { user } = session;
  const roles = user.roles.map((entry) => entry.role.name);

  const actor: Actor = {
    userId: user.id,
    sellerId: user.seller?.active ? user.seller.id : null,
    roles,
  };

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles,
    sellerId: actor.sellerId,
    sellerName: user.seller?.active ? user.seller.name : null,
    role: primaryRole(actor),
    isAdmin: isAdmin(actor),
    canViewDashboard: canViewDashboard(actor),
    canSuperviseQueue: canSuperviseQueue(actor),
    canManageRegistry: canManageSellerRegistry(actor),
    canManageSupervisors: canManageSupervisors(actor),
    canDownloadAuditLog: canDownloadAuditLog(actor),
    mustChangePassword: user.mustChangePassword,
  };
});

export function toActor(user: SessionUser): Actor {
  return { userId: user.id, sellerId: user.sellerId, roles: user.roles };
}

export async function getActor(): Promise<{ user: SessionUser; actor: Actor } | null> {
  const user = await getSessionUser();
  return user ? { user, actor: toActor(user) } : null;
}
