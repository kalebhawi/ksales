import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_ROLE,
  SELLER_ROLE,
  SUPERVISOR_ROLE,
  assignableRoles,
  canAssignRole,
  canEditOwnProfile,
  canAccessStore,
  canManageSeller,
  canManageSellerRegistry,
  canManageStores,
  canDownloadAuditLog,
  canManageSupervisors,
  canSuperviseQueue,
  canViewDashboard,
  isAdmin,
  isSupervisor,
  primaryRole,
  type Actor,
} from "../src/lib/authz";

const LOJA_1 = "loja-1";
const LOJA_2 = "loja-2";

// Administrador não tem vínculo de loja: enxerga todas.
const admin: Actor = { userId: "u1", sellerId: null, roles: [ADMIN_ROLE], storeIds: [] };
const supervisor: Actor = { userId: "u2", sellerId: null, roles: [SUPERVISOR_ROLE], storeIds: [LOJA_1] };
const seller: Actor = { userId: "u3", sellerId: "s3", roles: [SELLER_ROLE], storeIds: [LOJA_1] };
const orphan: Actor = { userId: "u4", sellerId: null, roles: [SELLER_ROLE], storeIds: [] };

describe("papéis", () => {
  it("reconhece cada papel", () => {
    assert.equal(isAdmin(admin), true);
    assert.equal(isAdmin(supervisor), false);
    assert.equal(isSupervisor(supervisor), true);
    assert.equal(isSupervisor(seller), false);
  });

  it("resolve o papel principal para exibição", () => {
    assert.equal(primaryRole(admin), ADMIN_ROLE);
    assert.equal(primaryRole(supervisor), SUPERVISOR_ROLE);
    assert.equal(primaryRole(seller), SELLER_ROLE);
    // Quem acumula papéis aparece pelo mais alto.
    assert.equal(primaryRole({ ...seller, roles: [SELLER_ROLE, ADMIN_ROLE] }), ADMIN_ROLE);
  });
});

describe("visão geral", () => {
  it("é tela de supervisão: vendedor não vê", () => {
    assert.equal(canViewDashboard(admin), true);
    assert.equal(canViewDashboard(supervisor), true);
    assert.equal(canViewDashboard(seller), false);
  });
});

describe("fila", () => {
  it("admin e supervisor comandam todos", () => {
    for (const actor of [admin, supervisor]) {
      assert.equal(canSuperviseQueue(actor), true);
      assert.equal(canManageSeller(actor, "s3"), true);
      assert.equal(canManageSeller(actor, "qualquer-outro"), true);
    }
  });

  it("vendedor move apenas o próprio cadastro", () => {
    assert.equal(canSuperviseQueue(seller), false);
    assert.equal(canManageSeller(seller, "s3"), true);
    assert.equal(canManageSeller(seller, "s9"), false);
  });

  it("usuário sem vendedor vinculado não move ninguém", () => {
    assert.equal(canManageSeller(orphan, "s3"), false);
  });
});

describe("cadastros", () => {
  it("admin e supervisor cadastram vendedores", () => {
    assert.equal(canManageSellerRegistry(admin), true);
    assert.equal(canManageSellerRegistry(supervisor), true);
    assert.equal(canManageSellerRegistry(seller), false);
  });

  it("só o admin cadastra supervisores", () => {
    assert.equal(canManageSupervisors(admin), true);
    assert.equal(canManageSupervisors(supervisor), false);
    assert.equal(canManageSupervisors(seller), false);
  });

  it("só o admin baixa a trilha de auditoria", () => {
    // O supervisor executa ações que entram no arquivo; não pode ser quem
    // confere o próprio rastro.
    assert.equal(canDownloadAuditLog(admin), true);
    assert.equal(canDownloadAuditLog(supervisor), false);
    assert.equal(canDownloadAuditLog(seller), false);
  });

  it("ninguém cria alguém do próprio nível ou acima", () => {
    assert.deepEqual(assignableRoles(admin), [SUPERVISOR_ROLE, SELLER_ROLE]);
    assert.deepEqual(assignableRoles(supervisor), [SELLER_ROLE]);
    assert.deepEqual(assignableRoles(seller), []);

    assert.equal(canAssignRole(admin, SUPERVISOR_ROLE), true);
    assert.equal(canAssignRole(admin, ADMIN_ROLE), false, "admin não cria outro admin pela tela");
    assert.equal(canAssignRole(supervisor, SUPERVISOR_ROLE), false, "supervisor não se replica");
    assert.equal(canAssignRole(supervisor, SELLER_ROLE), true);
    assert.equal(canAssignRole(seller, SELLER_ROLE), false);
  });
});

describe("perfil próprio", () => {
  it("cada vendedor edita apenas o seu", () => {
    assert.equal(canEditOwnProfile(seller, "s3"), true);
    assert.equal(canEditOwnProfile(seller, "s9"), false);
  });

  it("supervisão não herda a edição de perfil alheio por essa via", () => {
    // Supervisor altera o cadastro pela tela administrativa, não pelo /perfil.
    assert.equal(canEditOwnProfile(supervisor, "s3"), false);
    assert.equal(canEditOwnProfile(admin, "s3"), false);
  });
});

describe("lojas", () => {
  it("administrador enxerga qualquer loja, mesmo sem vínculo", () => {
    assert.equal(canAccessStore(admin, LOJA_1), true);
    assert.equal(canAccessStore(admin, LOJA_2), true);
  });

  it("supervisor enxerga só as lojas vinculadas", () => {
    assert.equal(canAccessStore(supervisor, LOJA_1), true);
    assert.equal(canAccessStore(supervisor, LOJA_2), false);
  });

  it("supervisor não comanda a fila de loja que não é dele", () => {
    assert.equal(canManageSeller(supervisor, "s9", LOJA_1), true);
    assert.equal(canManageSeller(supervisor, "s9", LOJA_2), false);
  });

  it("vendedor não comanda a si mesmo em loja que não enxerga", () => {
    // Vale para o caso de o vínculo ter sido trocado depois que a sessão abriu.
    assert.equal(canManageSeller(seller, "s3", LOJA_1), true);
    assert.equal(canManageSeller(seller, "s3", LOJA_2), false);
  });

  it("sem loja informada, a regra continua sendo só a de papel", () => {
    assert.equal(canManageSeller(supervisor, "s9"), true);
    assert.equal(canManageSeller(seller, "s3"), true);
    assert.equal(canManageSeller(seller, "s4"), false);
  });

  it("cadastro de lojas é só do administrador", () => {
    assert.equal(canManageStores(admin), true);
    assert.equal(canManageStores(supervisor), false);
    assert.equal(canManageStores(seller), false);
  });
});
