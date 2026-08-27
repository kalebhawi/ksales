import { NextResponse } from "next/server";
import { auditActor, recordAudit, recordAuditBatch } from "@/lib/audit-log";
import { getActor, type SessionUser } from "@/lib/auth";
import { canManageSeller, canSuperviseQueue } from "@/lib/authz";
import { badRequest, conflict, forbidden, notFound, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { loadSellerViews } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";
import { lockStoreQueue, nextQueuePosition, resequenceQueue } from "@/lib/queue-db";
import { loadStoreContext } from "@/lib/stores";
import {
  isQueueOperation,
  isQueueWideOperation,
  planQueueTransition,
  reorderQueue,
  type QueueAction,
  type QueueStatus,
} from "@/lib/queue";
import type { AuditActor, AuditStore } from "@/lib/audit-events";

export const dynamic = "force-dynamic";

/** Cada transição da fila tem uma ação equivalente na trilha de auditoria. */
const AUDIT_BY_QUEUE_ACTION = {
  ENTERED_QUEUE: "ENTERED_QUEUE",
  RETURNED_TO_QUEUE: "RETURNED_TO_QUEUE",
  STARTED_SERVICE: "STARTED_SERVICE",
  REMOVED_FROM_QUEUE: "REMOVED_FROM_QUEUE",
  ENDED_SHIFT: "ENDED_SHIFT",
} as const satisfies Record<QueueAction, string>;

type Store = { id: string; name: string };

export async function GET() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const { active } = await loadStoreContext(session.user);

  return NextResponse.json(await loadSellerViews(session.actor, active?.id ?? null));
}

export async function PATCH(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const body = await readJson(request);
  const id = typeof body.id === "string" ? body.id : "";
  const operation = body.operation;
  const actor = auditActor(session.user);

  // Operações da fila inteira não recebem `id` e só valem para a supervisão.
  // Valem para a fila da loja aberta na tela: nunca atravessam lojas.
  if (isQueueWideOperation(operation)) {
    if (!canSuperviseQueue(session.actor)) return forbidden();

    const store = await currentStore(session.user);
    if (!store) return conflict("Selecione uma loja antes de operar a fila.");

    return operation === "start_next"
      ? startNext(session.user.id, actor, store)
      : endShiftAll(session.user.id, actor, store);
  }

  if (!id || !isQueueOperation(operation)) {
    return badRequest("Informe o vendedor e uma operação válida da fila.");
  }

  const seller = await prisma.seller.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      active: true,
      queueStatus: true,
      queuePosition: true,
      storeId: true,
      store: { select: { id: true, name: true } },
    },
  });
  if (!seller || !seller.active) return notFound("Vendedor não encontrado.");

  // A loja que vale é a do vendedor, não a que está aberta na tela: quem não
  // enxerga aquela loja não mexe na fila dela nem mandando o id na mão.
  if (!canManageSeller(session.actor, id, seller.storeId)) return forbidden();

  const store = seller.store;

  if (operation === "reorder") {
    return reorderHandler(seller, body.targetIndex, actor, store);
  }

  const plan = planQueueTransition(seller.queueStatus, operation, body);
  if (!plan.ok) return conflict(plan.error);

  const { transition } = plan;

  const position = await prisma.$transaction(async (tx) => {
    await lockStoreQueue(tx, seller.storeId);

    const queuePosition = transition.status === "QUEUED" ? await nextQueuePosition(tx, seller.storeId) : null;

    await tx.seller.update({
      where: { id: seller.id },
      data: { queueStatus: transition.status, queuePosition },
    });

    await tx.queueEvent.create({
      data: {
        sellerId: seller.id,
        action: transition.action,
        reason: transition.reason,
        notes: transition.notes,
        performedBy: session.user.id,
      },
    });

    if (transition.status === "IN_SERVICE") {
      await tx.atendimento.create({
        data: { sellerId: seller.id, storeId: seller.storeId, initiatedBy: session.user.id },
      });
    }

    if (transition.status !== "QUEUED") {
      await resequenceQueue(tx, seller.storeId);
    }

    return queuePosition;
  });

  // Só depois do commit: nada entra na trilha se a transação foi desfeita.
  await recordAudit({
    action: AUDIT_BY_QUEUE_ACTION[transition.action],
    actor,
    target: { id: seller.id, name: seller.name },
    store,
    details: {
      ...(position !== null ? { posicaoNaFila: position } : {}),
      // De onde saiu importa tanto quanto para onde foi.
      ...(seller.queuePosition !== null ? { posicaoAnterior: seller.queuePosition } : {}),
      ...(transition.reason ? { motivo: transition.reason } : {}),
      ...(transition.notes ? { observacao: transition.notes } : {}),
      origem: "fila",
    },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Loja aberta na tela, com o nome que vai para a trilha. Vem do contexto, que
 * já traz id e nome — buscar de novo no banco só para ler o nome era uma
 * consulta a mais por operação de fila.
 */
async function currentStore(user: SessionUser): Promise<Store | null> {
  const { active } = await loadStoreContext(user);

  return active ? { id: active.id, name: active.name } : null;
}

/** Chama o primeiro da fila. A escolha e o início acontecem na mesma transação. */
async function startNext(performedBy: string, actor: AuditActor, store: Store) {
  const started = await prisma.$transaction(async (tx) => {
    // Trava antes de escolher: sem ela, dois supervisores chamando ao mesmo
    // tempo escolhem o mesmo vendedor e abrem dois atendimentos para ele.
    await lockStoreQueue(tx, store.id);

    const next = await tx.seller.findFirst({
      where: { storeId: store.id, queueStatus: "QUEUED", active: true },
      orderBy: [{ queuePosition: "asc" }, { updatedAt: "asc" }],
      select: { id: true, name: true, queuePosition: true },
    });

    if (!next) return null;

    await tx.seller.update({ where: { id: next.id }, data: { queueStatus: "IN_SERVICE", queuePosition: null } });
    await tx.queueEvent.create({ data: { sellerId: next.id, action: "STARTED_SERVICE", performedBy } });
    await tx.atendimento.create({ data: { sellerId: next.id, storeId: store.id, initiatedBy: performedBy } });
    await resequenceQueue(tx, store.id);

    return next;
  });

  if (!started) return conflict("A fila está vazia.");

  await recordAudit({
    action: "STARTED_SERVICE",
    actor,
    target: { id: started.id, name: started.name },
    store,
    details: { posicaoAnterior: started.queuePosition, origem: "chamar_o_proximo" },
  });

  return NextResponse.json({ ok: true, sellerId: started.id, name: started.name });
}

/**
 * Encerra o turno de todo mundo que está na fila. Quem está em atendimento fica
 * de fora de propósito: tem um atendimento aberto, que precisa de desfecho.
 */
async function endShiftAll(performedBy: string, actor: AuditActor, store: Store) {
  const encerrados = await prisma.$transaction(async (tx) => {
    await lockStoreQueue(tx, store.id);

    const queued = await tx.seller.findMany({
      where: { storeId: store.id, queueStatus: "QUEUED" },
      select: { id: true, name: true, queuePosition: true },
    });

    for (const seller of queued) {
      await tx.seller.update({
        where: { id: seller.id },
        data: { queueStatus: "OFF_SHIFT", queuePosition: null },
      });
      await tx.queueEvent.create({
        data: { sellerId: seller.id, action: "ENDED_SHIFT", reason: "encerrar_dia", performedBy },
      });
    }

    return queued;
  });

  // Uma linha por vendedor: a trilha precisa dizer quem saiu, não só quantos.
  // Em lote, porém: são N linhas de um comando só, e não N comandos.
  await recordAuditBatch(
    encerrados.map((seller) => ({
      action: "ENDED_SHIFT" as const,
      actor,
      target: { id: seller.id, name: seller.name },
      store,
      details: { motivo: "encerrar_dia", posicaoAnterior: seller.queuePosition, origem: "encerrar_dia_de_todos" },
    })),
  );

  return NextResponse.json({ ok: true, count: encerrados.length });
}

async function reorderHandler(
  seller: { id: string; name: string; queueStatus: QueueStatus; storeId: string },
  targetIndex: unknown,
  actor: AuditActor,
  store: AuditStore,
) {
  if (seller.queueStatus !== "QUEUED") return conflict("Só é possível reordenar quem está na fila.");
  if (!Number.isInteger(targetIndex)) return badRequest("Informe a nova posição na fila.");

  const moved = await prisma.$transaction(async (tx) => {
    await lockStoreQueue(tx, seller.storeId);

    const queued = await tx.seller.findMany({
      where: { storeId: seller.storeId, queueStatus: "QUEUED" },
      orderBy: [{ queuePosition: "asc" }, { updatedAt: "asc" }],
      select: { id: true },
    });

    const ids = queued.map((entry) => entry.id);
    const positions = reorderQueue(ids, seller.id, targetIndex as number);
    if (!positions) return null;

    for (const entry of positions) {
      await tx.seller.update({ where: { id: entry.id }, data: { queuePosition: entry.queuePosition } });
    }

    return {
      from: ids.indexOf(seller.id) + 1,
      to: positions.find((entry) => entry.id === seller.id)?.queuePosition ?? null,
      total: positions.length,
    };
  });

  if (moved && moved.from !== moved.to) {
    await recordAudit({
      action: "REORDERED_QUEUE",
      actor,
      target: { id: seller.id, name: seller.name },
      store,
      details: { posicaoAnterior: moved.from, posicaoNova: moved.to, totalNaFila: moved.total },
    });
  }

  return NextResponse.json({ ok: true });
}
