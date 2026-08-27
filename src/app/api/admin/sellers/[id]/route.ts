import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { ADMIN_SELLER_SELECT } from "@/app/api/admin/sellers/route";
import { getActor } from "@/lib/auth";
import { canAccessStore, canManageSellerRegistry } from "@/lib/authz";
import { badRequest, conflict, forbidden, notFound, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { validatePhotoUrl, validateSellerLevel, validateSellerName } from "@/lib/seller-rules";
import { prisma } from "@/lib/prisma";
import { lockStoreQueue, resequenceQueue } from "@/lib/queue-db";
import { destroyUserSessions } from "@/lib/session";
import { assertStoreAccess } from "@/lib/stores";

export const dynamic = "force-dynamic";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Desativar alguém que está atendendo deixava o `Atendimento` em andamento para
 * sempre: ele continuava contando como atendimento nas estatísticas e não havia
 * caminho na tela para concluí-lo, porque o vendedor tinha sumido da fila.
 *
 * `CANCELLED` e não `COMPLETED`: não houve desfecho, houve interrupção.
 */
async function cancelOpenService(tx: Tx, sellerId: string, performedBy: string) {
  const { count } = await tx.atendimento.updateMany({
    where: { sellerId, status: "IN_PROGRESS" },
    data: { status: "CANCELLED", concludedAt: new Date(), concludedBy: performedBy },
  });

  return count;
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/sellers/[id]">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSellerRegistry(session.actor)) return forbidden();

  const { id } = await ctx.params;
  const body = await readJson(request);

  const seller = await prisma.seller.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      userId: true,
      queueStatus: true,
      storeId: true,
      store: { select: { id: true, name: true } },
    },
  });
  if (!seller) return notFound("Vendedor não encontrado.");
  if (!canAccessStore(session.actor, seller.storeId)) return forbidden();

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const check = validateSellerName(body.name);
    if (!check.ok) return badRequest(check.error);
    data.name = check.value;
  }

  if (typeof body.badgeNumber === "string") {
    const badgeNumber = body.badgeNumber.trim();
    if (!badgeNumber) return badRequest("Crachá não pode ficar vazio.");

    const taken = await prisma.seller.findUnique({ where: { badgeNumber }, select: { id: true } });
    if (taken && taken.id !== id) return conflict("Já existe um vendedor com este crachá.");
    data.badgeNumber = badgeNumber;
  }

  if (body.level !== undefined) {
    const check = validateSellerLevel(body.level);
    if (!check.ok) return badRequest(check.error);
    data.level = check.value;
  }

  if (typeof body.description === "string") data.description = body.description.trim() || null;

  // Transferência de loja. A fila é por loja, então quem muda sai da fila da
  // antiga: manter a posição levaria uma numeração para uma fila onde ela não
  // significa nada.
  const movingTo =
    typeof body.storeId === "string" && body.storeId && body.storeId !== seller.storeId ? body.storeId : null;

  if (movingTo) {
    if (!(await assertStoreAccess(session.actor, movingTo))) return forbidden();
    if (seller.queueStatus === "IN_SERVICE") {
      return conflict("Conclua o atendimento em andamento antes de transferir o vendedor de loja.");
    }

    data.storeId = movingTo;
    data.queueStatus = "OFF_SHIFT";
    data.queuePosition = null;
  }

  if (body.photoUrl !== undefined) {
    const check = validatePhotoUrl(body.photoUrl);
    if (!check.ok) return badRequest(check.error);
    data.photoUrl = check.value;

    // URL e upload são exclusivos: informar uma URL descarta a imagem salva.
    if (check.value) await prisma.sellerPhoto.deleteMany({ where: { sellerId: id } });
  }

  const newPassword = typeof body.password === "string" && body.password.length > 0 ? body.password : null;

  if (newPassword) {
    if (!seller.userId) return badRequest("Este vendedor não possui usuário de acesso.");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return badRequest(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
  }

  const deactivating = body.active === false;

  if (deactivating) {
    data.active = false;
    data.queueStatus = "OFF_SHIFT";
    data.queuePosition = null;
  } else if (body.active === true) {
    data.active = true;
  }

  const passwordHash = newPassword ? await hashPassword(newPassword) : null;
  let cancelled = 0;

  const updated = await prisma.$transaction(async (tx) => {
    if (movingTo || deactivating) await lockStoreQueue(tx, seller.storeId);

    if (movingTo) {
      await tx.queueEvent.create({
        data: { sellerId: id, action: "ENDED_SHIFT", reason: "transferencia_de_loja", performedBy: session.user.id },
      });
    }

    if (passwordHash && seller.userId) {
      // Reset feito pelo administrador também gera senha provisória.
      await tx.user.update({
        where: { id: seller.userId },
        data: { passwordHash, mustChangePassword: true },
      });
    }

    if (typeof body.active === "boolean" && seller.userId) {
      await tx.user.update({ where: { id: seller.userId }, data: { active: body.active } });
    }

    if (deactivating && seller.queueStatus !== "OFF_SHIFT") {
      await tx.queueEvent.create({
        data: { sellerId: id, action: "ENDED_SHIFT", reason: "desativado", performedBy: session.user.id },
      });
    }

    if (deactivating) cancelled = await cancelOpenService(tx, id, session.user.id);

    const saved = await tx.seller.update({ where: { id }, data, select: ADMIN_SELLER_SELECT });

    // Sem isto a fila fica com um buraco na numeração: quem saiu do meio dela
    // levou a posição junto.
    if (movingTo || deactivating) await resequenceQueue(tx, seller.storeId);

    return saved;
  });

  if (seller.userId && (body.active === false || passwordHash)) {
    await destroyUserSessions(seller.userId);
  }

  // Ativar e desativar são fatos próprios na trilha; o resto é edição.
  const action =
    body.active === false ? "SELLER_DEACTIVATED" : body.active === true ? "SELLER_REACTIVATED" : "SELLER_UPDATED";

  await recordAudit({
    action,
    actor: auditActor(session.user),
    target: { id: updated.id, name: updated.name },
    store: updated.store,
    details: {
      campos: Object.keys(data),
      ...(passwordHash ? { senhaRedefinida: true, provisoria: true } : {}),
      ...(seller.name !== updated.name ? { nomeAnterior: seller.name } : {}),
      ...(cancelled > 0 ? { atendimentoCancelado: true } : {}),
    },
  });

  // Transferência é um fato próprio na trilha: sai da loja de origem e entra na
  // de destino, e as duas precisam aparecer.
  if (movingTo) {
    await recordAudit({
      action: "SELLER_STORE_CHANGED",
      actor: auditActor(session.user),
      target: { id: updated.id, name: updated.name },
      store: updated.store,
      details: { lojaAnterior: seller.store.name, loja: updated.store.name, situacaoAnterior: seller.queueStatus },
    });
  }

  return NextResponse.json(updated);
}

/** Desativação (soft delete): preserva o histórico de atendimentos e da fila. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/sellers/[id]">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSellerRegistry(session.actor)) return forbidden();

  const { id } = await ctx.params;
  const seller = await prisma.seller.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      userId: true,
      queueStatus: true,
      storeId: true,
      store: { select: { id: true, name: true } },
    },
  });
  if (!seller) return notFound("Vendedor não encontrado.");
  if (!canAccessStore(session.actor, seller.storeId)) return forbidden();

  let cancelled = 0;

  await prisma.$transaction(async (tx) => {
    await lockStoreQueue(tx, seller.storeId);

    await tx.seller.update({
      where: { id },
      data: { active: false, queueStatus: "OFF_SHIFT", queuePosition: null },
    });

    cancelled = await cancelOpenService(tx, id, session.user.id);

    if (seller.userId) await tx.user.update({ where: { id: seller.userId }, data: { active: false } });

    if (seller.queueStatus !== "OFF_SHIFT") {
      await tx.queueEvent.create({
        data: { sellerId: id, action: "ENDED_SHIFT", reason: "desativado", performedBy: session.user.id },
      });
    }

    await resequenceQueue(tx, seller.storeId);
  });

  if (seller.userId) await destroyUserSessions(seller.userId);

  await recordAudit({
    action: "SELLER_DEACTIVATED",
    actor: auditActor(session.user),
    target: { id: seller.id, name: seller.name },
    store: seller.store,
    details: {
      situacaoAnterior: seller.queueStatus,
      acessoRevogado: Boolean(seller.userId),
      ...(cancelled > 0 ? { atendimentoCancelado: true } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
