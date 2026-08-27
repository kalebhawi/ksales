import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { canManageSeller } from "@/lib/authz";
import { badRequest, forbidden, notFound, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { lockStoreQueue } from "@/lib/queue-db";

export const dynamic = "force-dynamic";

const ACTIONS = ["SALE_CONVERTED", "SALE_NOT_CONVERTED", "EXCHANGE", "OTHER"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return ACTIONS.includes(value as Action);
}

export async function PATCH(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const body = await readJson(request);
  const sellerId = typeof body.sellerId === "string" ? body.sellerId : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!sellerId || !isAction(body.action)) {
    return badRequest("Informe o vendedor e a ação do atendimento.");
  }

  if (body.action === "OTHER" && notes.length === 0) {
    return badRequest("Descreva o motivo quando selecionar “Outro”.");
  }

  const atendimento = await prisma.atendimento.findFirst({
    where: { sellerId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      storeId: true,
      seller: { select: { name: true, store: { select: { id: true, name: true } } } },
    },
  });

  if (!atendimento) return notFound("Nenhum atendimento em andamento encontrado.");

  // A checagem vem depois da consulta porque depende da loja do atendimento:
  // concluir o atendimento de outra loja é tão proibido quanto abrir um.
  if (!canManageSeller(session.actor, sellerId, atendimento.storeId)) return forbidden();

  const concludedAt = new Date();

  const position = await prisma.$transaction(async (tx) => {
    await lockStoreQueue(tx, atendimento.storeId);

    await tx.atendimento.update({
      where: { id: atendimento.id },
      data: {
        status: "COMPLETED",
        action: body.action as Action,
        notes: notes || undefined,
        concludedAt,
        concludedBy: session.user.id,
      },
    });

    // Concluir devolve para o FIM da fila, não para "disponíveis": quem acabou
    // de atender entra de novo no rodízio, atrás de quem ainda não atendeu.
    // Para sair do rodízio (intervalo, fim de turno) existe a operação
    // `remove` em /api/sellers, que exige motivo.
    const last = await tx.seller.findFirst({
      where: { storeId: atendimento.storeId, queueStatus: "QUEUED" },
      orderBy: { queuePosition: "desc" },
      select: { queuePosition: true },
    });

    const queuePosition = (last?.queuePosition ?? 0) + 1;

    await tx.seller.update({
      where: { id: sellerId },
      data: { queueStatus: "QUEUED", queuePosition },
    });

    await tx.queueEvent.create({
      data: {
        sellerId,
        action: "RETURNED_TO_QUEUE",
        reason: body.action as Action,
        notes: notes || undefined,
        performedBy: session.user.id,
      },
    });

    return queuePosition;
  });

  const actor = auditActor(session.user);
  const target = { id: sellerId, name: atendimento.seller.name };
  const store = atendimento.seller.store;

  // Duas linhas porque são dois fatos distintos para quem audita: como o
  // atendimento terminou, e onde o vendedor voltou a ficar na fila.
  await recordAudit({
    action: "COMPLETED_SERVICE",
    actor,
    target,
    store,
    at: concludedAt,
    details: {
      status: body.action as Action,
      atendimentoId: atendimento.id,
      duracaoSegundos: Math.round((concludedAt.getTime() - atendimento.startedAt.getTime()) / 1000),
      ...(notes ? { observacao: notes } : {}),
    },
  });

  await recordAudit({
    action: "RETURNED_TO_QUEUE",
    actor,
    target,
    store,
    details: { posicaoNaFila: position, origem: "conclusao_de_atendimento" },
  });

  return NextResponse.json({ ok: true, atendimentoId: atendimento.id });
}
