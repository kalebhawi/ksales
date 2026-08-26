import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { SUPERVISOR_ROLE, canAssignRole, canManageSupervisors } from "@/lib/authz";
import { badRequest, conflict, forbidden, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { validateSellerName } from "@/lib/seller-rules";
import { sortStores } from "@/lib/store-rules";
import { assertStoreAccess } from "@/lib/stores";

export const dynamic = "force-dynamic";

export const SUPERVISOR_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
  stores: { select: { store: { select: { id: true, name: true } } } },
} as const;

type SupervisorRecord = {
  createdAt: Date;
  stores: { store: { id: string; name: string } }[];
};

/**
 * O vínculo com loja é tabela de junção no banco e lista simples na tela.
 * A tradução é aqui, e não em cada componente, para a página e a API
 * devolverem exatamente a mesma forma.
 */
export function toSupervisorView<T extends SupervisorRecord>(user: T) {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    stores: sortStores(user.stores.map((entry) => entry.store)),
  };
}

/** Ids de loja válidos vindos do corpo da requisição. */
export function readStoreIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
}

/** Supervisores são usuários sem cadastro de vendedor: não entram na fila. */
const SUPERVISOR_FILTER = { roles: { some: { role: { name: SUPERVISOR_ROLE } } } };

export async function GET() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSupervisors(session.actor)) return forbidden();

  const supervisors = await prisma.user.findMany({
    where: SUPERVISOR_FILTER,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: SUPERVISOR_SELECT,
  });

  return NextResponse.json(supervisors.map(toSupervisorView));
}

export async function POST(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  // Dupla checagem proposital: `canManageSupervisors` responde pela tela e
  // `canAssignRole` pela hierarquia — supervisor nunca cria outro supervisor.
  if (!canManageSupervisors(session.actor) || !canAssignRole(session.actor, SUPERVISOR_ROLE)) {
    return forbidden();
  }

  const body = await readJson(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const nameCheck = validateSellerName(body.name);
  if (!nameCheck.ok) return badRequest(nameCheck.error);

  if (!email) return badRequest("E-mail de acesso é obrigatório.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return badRequest(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return conflict("Já existe um usuário com este e-mail.");
  }

  // Supervisor sem loja não enxerga vendedor nenhum: exigir pelo menos uma
  // evita criar um acesso que abre numa tela vazia.
  const storeIds = readStoreIds(body.storeIds);
  if (storeIds.length === 0) return badRequest("Selecione ao menos uma loja para o supervisor.");

  for (const storeId of storeIds) {
    if (!(await assertStoreAccess(session.actor, storeId))) return badRequest("Loja inválida.");
  }

  const passwordHash = await hashPassword(password);

  const supervisor = await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { name: SUPERVISOR_ROLE },
      update: {},
      create: { name: SUPERVISOR_ROLE, description: "Supervisiona a fila e cadastra vendedores." },
    });

    const user = await tx.user.create({
      data: { email, name: nameCheck.value, passwordHash, mustChangePassword: true },
      select: { id: true },
    });

    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await tx.userStore.createMany({ data: storeIds.map((storeId) => ({ userId: user.id, storeId })) });

    return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: SUPERVISOR_SELECT });
  });

  await recordAudit({
    action: "SUPERVISOR_CREATED",
    actor: auditActor(session.user),
    target: { id: supervisor.id, name: supervisor.name },
    details: {
      email: supervisor.email,
      senhaProvisoria: true,
      lojas: supervisor.stores.map((entry) => entry.store.name),
    },
  });

  return NextResponse.json(toSupervisorView(supervisor), { status: 201 });
}
