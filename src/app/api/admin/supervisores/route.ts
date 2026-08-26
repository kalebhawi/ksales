import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { SUPERVISOR_ROLE, canAssignRole, canManageSupervisors } from "@/lib/authz";
import { badRequest, conflict, forbidden, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { validateSellerName } from "@/lib/seller-rules";

export const dynamic = "force-dynamic";

export const SUPERVISOR_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

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

  return NextResponse.json(supervisors);
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

  const passwordHash = await hashPassword(password);

  const supervisor = await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { name: SUPERVISOR_ROLE },
      update: {},
      create: { name: SUPERVISOR_ROLE, description: "Supervisiona a fila e cadastra vendedores." },
    });

    const user = await tx.user.create({
      data: { email, name: nameCheck.value, passwordHash, mustChangePassword: true },
      select: SUPERVISOR_SELECT,
    });

    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });

    return user;
  });

  await recordAudit({
    action: "SUPERVISOR_CREATED",
    actor: auditActor(session.user),
    target: { id: supervisor.id, name: supervisor.name },
    details: { email: supervisor.email, senhaProvisoria: true },
  });

  return NextResponse.json(supervisor, { status: 201 });
}
