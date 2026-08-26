export const ADMIN_ROLE = "admin";
export const SUPERVISOR_ROLE = "supervisor";
export const SELLER_ROLE = "seller";

/** Hierarquia da operação, do mais forte para o mais fraco. */
export const ROLES = [ADMIN_ROLE, SUPERVISOR_ROLE, SELLER_ROLE] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  [ADMIN_ROLE]: "Administrador",
  [SUPERVISOR_ROLE]: "Supervisor",
  [SELLER_ROLE]: "Vendedor",
};

export type Actor = {
  userId: string;
  sellerId: string | null;
  roles: string[];
};

export function isAdmin(actor: Actor) {
  return actor.roles.includes(ADMIN_ROLE);
}

export function isSupervisor(actor: Actor) {
  return actor.roles.includes(SUPERVISOR_ROLE);
}

/** Papel mais alto do usuário, usado só para exibição. */
export function primaryRole(actor: Actor): Role {
  if (isAdmin(actor)) return ADMIN_ROLE;
  if (isSupervisor(actor)) return SUPERVISOR_ROLE;

  return SELLER_ROLE;
}

/** Administrador e supervisor comandam a fila inteira; vendedor, só a si mesmo. */
export function canSuperviseQueue(actor: Actor) {
  return isAdmin(actor) || isSupervisor(actor);
}

/** A visão geral é tela de supervisão: vendedor não vê. */
export function canViewDashboard(actor: Actor) {
  return canSuperviseQueue(actor);
}

export function canManageSeller(actor: Actor, sellerId: string) {
  return canSuperviseQueue(actor) || (actor.sellerId !== null && actor.sellerId === sellerId);
}

/** Cadastro de vendedores: administrador e supervisor. */
export function canManageSellerRegistry(actor: Actor) {
  return canSuperviseQueue(actor);
}

/**
 * Trilha de auditoria: só administrador. Supervisor executa ações que entram no
 * arquivo, então não pode ser quem baixa e confere o próprio rastro.
 */
export function canDownloadAuditLog(actor: Actor) {
  return isAdmin(actor);
}

/** Cadastro de supervisores: só administrador. */
export function canManageSupervisors(actor: Actor) {
  return isAdmin(actor);
}

/**
 * Um papel nunca pode criar alguém do mesmo nível ou acima: administrador cria
 * supervisor e vendedor, supervisor cria apenas vendedor.
 */
export function assignableRoles(actor: Actor): Role[] {
  if (isAdmin(actor)) return [SUPERVISOR_ROLE, SELLER_ROLE];
  if (isSupervisor(actor)) return [SELLER_ROLE];

  return [];
}

export function canAssignRole(actor: Actor, role: string): role is Role {
  return (assignableRoles(actor) as string[]).includes(role);
}

/** Vendedor edita o próprio perfil (foto e descrição). */
export function canEditOwnProfile(actor: Actor, sellerId: string) {
  return actor.sellerId !== null && actor.sellerId === sellerId;
}
