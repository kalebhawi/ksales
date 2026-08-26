import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { SUPERVISOR_SELECT, readStoreIds, toSupervisorView } from "@/app/api/admin/supervisores/route";
import { getActor } from "@/lib/auth";
import { canManageSupervisors } from "@/lib/authz";
import { badRequest, conflict, forbidden, notFound, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { destroyUserSessions } from "@/lib/session";
import { validateSellerName } from "@/lib/seller-rules";
import { assertStoreAccess } from "@/lib/stores";

export const dynamic = "force-dynamic";

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((entry) => b.includes(entry));
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/supervisores/[id]">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSupervisors(session.actor)) return forbidden();

  const { id } = await ctx.params;

  // Um administrador não se rebaixa nem se desativa por engano por aqui.
  if (id === session.user.id) return conflict("Use outra conta de administrador para alterar a sua.");

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, stores: { select: { storeId: true, store: { select: { name: true } } } } },
  });
  if (!target) return notFound("Supervisor não encontrado.");

  const body = await readJson(request);
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const check = validateSellerName(body.name);
    if (!check.ok) return badRequest(check.error);
    data.name = check.value;
  }

  const newPassword = typeof body.password === "string" && body.password.length > 0 ? body.password : null;

  if (newPassword) {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return badRequest(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    // Reset feito pelo administrador é sempre provisório.
    data.passwordHash = await hashPassword(newPassword);
    data.mustChangePassword = true;
  }

  if (typeof body.active === "boolean") data.active = body.active;

  // `storeIds` ausente não mexe nos vínculos; presente substitui a lista
  // inteira, que é como a tela envia — marcado é o que fica.
  const storeIds = body.storeIds === undefined ? null : readStoreIds(body.storeIds);

  if (storeIds) {
    if (storeIds.length === 0) return badRequest("Selecione ao menos uma loja para o supervisor.");

    for (const storeId of storeIds) {
      if (!(await assertStoreAccess(session.actor, storeId))) return badRequest("Loja inválida.");
    }
  }

  const previousStores = target.stores.map((entry) => entry.storeId);

  const updated = await prisma.$transaction(async (tx) => {
    if (storeIds) {
      await tx.userStore.deleteMany({ where: { userId: id, storeId: { notIn: storeIds } } });
      await tx.userStore.createMany({
        data: storeIds.map((storeId) => ({ userId: id, storeId })),
        skipDuplicates: true,
      });
    }

    return tx.user.update({ where: { id }, data, select: SUPERVISOR_SELECT });
  });

  if (newPassword || body.active === false) await destroyUserSessions(id);

  const action =
    body.active === false
      ? "SUPERVISOR_DEACTIVATED"
      : body.active === true
        ? "SUPERVISOR_REACTIVATED"
        : "SUPERVISOR_UPDATED";

  await recordAudit({
    action,
    actor: auditActor(session.user),
    target: { id: updated.id, name: updated.name },
    details: {
      email: updated.email,
      ...(newPassword ? { senhaRedefinida: true, provisoria: true } : {}),
      ...(target.name !== updated.name ? { nomeAnterior: target.name } : {}),
    },
  });

  // Mudança de loja é fato próprio: é ela que decide o que essa pessoa enxerga.
  const changedStores = storeIds && !sameSet(previousStores, storeIds);

  if (changedStores) {
    await recordAudit({
      action: "SUPERVISOR_STORES_UPDATED",
      actor: auditActor(session.user),
      target: { id: updated.id, name: updated.name },
      details: {
        lojas: updated.stores.map((entry) => entry.store.name),
        removidas: target.stores.filter((entry) => !storeIds.includes(entry.storeId)).map((entry) => entry.store.name),
      },
    });
  }

  return NextResponse.json(toSupervisorView(updated));
}

/** Desativação: o histórico de quem executou ações na fila é preservado. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/supervisores/[id]">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSupervisors(session.actor)) return forbidden();

  const { id } = await ctx.params;
  if (id === session.user.id) return conflict("Você não pode desativar a própria conta.");

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  if (!target) return notFound("Supervisor não encontrado.");

  await prisma.user.update({ where: { id }, data: { active: false } });
  await destroyUserSessions(id);

  await recordAudit({
    action: "SUPERVISOR_DEACTIVATED",
    actor: auditActor(session.user),
    target: { id: target.id, name: target.name },
    details: { email: target.email, acessoRevogado: true },
  });

  return NextResponse.json({ ok: true });
}
