import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { canManageSeller, canSuperviseQueue } from "@/lib/authz";
import { badRequest, conflict, forbidden, notFound, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { loadSellerViews } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";
import {
  isQueueOperation,
  isQueueWideOperation,
  planQueueTransition,
  reorderQueue,
  type QueueAction,
  type QueueStatus,
} from "@/lib/queue";
import type { AuditActor } from "@/lib/audit-events";

export const dynamic = "force-dynamic";

/** Cada transição da fila tem uma ação equivalente na trilha de auditoria. */
const AUDIT_BY_QUEUE_ACTION = {
  ENTERED_QUEUE: "ENTERED_QUEUE",
  RETURNED_TO_QUEUE: "RETURNED_TO_QUEUE",
  STARTED_SERVICE: "STARTED_SERVICE",
  REMOVED_FROM_QUEUE: "REMOVED_FROM_QUEUE",
  ENDED_SHIFT: "ENDED_SHIFT",
} as const satisfies Record<QueueAction, string>;

export async function GET() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  return NextResponse.json(await loadSellerViews(session.actor));
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
  if (isQueueWideOperation(operation)) {
    if (!canSuperviseQueue(session.actor)) return forbidden();

    return operation === "start_next" ? startNext(session.user.id, actor) : endShiftAll(session.user.id, actor);
  }

  if (!id || !isQueueOperation(operation)) {
    return badRequest("Informe o vendedor e uma operação válida da fila.");
  }

  if (!canManageSeller(session.actor, id)) return forbidden();

  const seller = await prisma.seller.findUnique({
    where: { id },
    select: { id: true, name: true, active: true, queueStatus: true, queuePosition: true },
  });
  if (!seller || !seller.active) return notFound("Vendedor não encontrado.");

  if (operation === "reorder") {
    return reorderHandler(seller, body.targetIndex, actor);
  }

  const plan = planQueueTransition(seller.queueStatus, operation, body);
  if (!plan.ok) return conflict(plan.error);

  const { transition } = plan;

  const position = await prisma.$transaction(async (tx) => {
    const queuePosition = transition.status === "QUEUED" ? await nextQueuePosition(tx) : null;

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
      await tx.atendimento.create({ data: { sellerId: seller.id, initiatedBy: session.user.id } });
    }

    if (transition.status !== "QUEUED") {
      await resequenceQueue(tx);
    }

    return queuePosition;
  });

  // Só depois do commit: nada entra na trilha se a transação foi desfeita.
  await recordAudit({
    action: AUDIT_BY_QUEUE_ACTION[transition.action],
    actor,
    target: { id: seller.id, name: seller.name },
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

/** Chama o primeiro da fila. A escolha e o início acontecem na mesma transação. */
async function startNext(performedBy: string, actor: AuditActor) {
  const started = await prisma.$transaction(async (tx) => {
    const next = await tx.seller.findFirst({
      where: { queueStatus: "QUEUED", active: true },
      orderBy: [{ queuePosition: "asc" }, { updatedAt: "asc" }],
      select: { id: true, name: true, queuePosition: true },
    });

    if (!next) return null;

    await tx.seller.update({ where: { id: next.id }, data: { queueStatus: "IN_SERVICE", queuePosition: null } });
    await tx.queueEvent.create({ data: { sellerId: next.id, action: "STARTED_SERVICE", performedBy } });
    await tx.atendimento.create({ data: { sellerId: next.id, initiatedBy: performedBy } });
    await resequenceQueue(tx);

    return next;
  });

  if (!started) return conflict("A fila está vazia.");

  await recordAudit({
    action: "STARTED_SERVICE",
    actor,
    target: { id: started.id, name: started.name },
    details: { posicaoAnterior: started.queuePosition, origem: "chamar_o_proximo" },
  });

  return NextResponse.json({ ok: true, sellerId: started.id, name: started.name });
}

/**
 * Encerra o turno de todo mundo que está na fila. Quem está em atendimento fica
 * de fora de propósito: tem um atendimento aberto, que precisa de desfecho.
 */
async function endShiftAll(performedBy: string, actor: AuditActor) {
  const encerrados = await prisma.$transaction(async (tx) => {
    const queued = await tx.seller.findMany({
      where: { queueStatus: "QUEUED" },
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
  for (const seller of encerrados) {
    await recordAudit({
      action: "ENDED_SHIFT",
      actor,
      target: { id: seller.id, name: seller.name },
      details: { motivo: "encerrar_dia", posicaoAnterior: seller.queuePosition, origem: "encerrar_dia_de_todos" },
    });
  }

  return NextResponse.json({ ok: true, count: encerrados.length });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function nextQueuePosition(tx: Tx) {
  const last = await tx.seller.findFirst({
    where: { queueStatus: "QUEUED" },
    orderBy: { queuePosition: "desc" },
    select: { queuePosition: true },
  });

  return (last?.queuePosition ?? 0) + 1;
}

async function resequenceQueue(tx: Tx) {
  const queued = await tx.seller.findMany({
    where: { queueStatus: "QUEUED" },
    orderBy: [{ queuePosition: "asc" }, { updatedAt: "asc" }],
    select: { id: true, queuePosition: true },
  });

  for (const [index, entry] of queued.entries()) {
    if (entry.queuePosition !== index + 1) {
      await tx.seller.update({ where: { id: entry.id }, data: { queuePosition: index + 1 } });
    }
  }
}

async function reorderHandler(
  seller: { id: string; name: string; queueStatus: QueueStatus },
  targetIndex: unknown,
  actor: AuditActor,
) {
  if (seller.queueStatus !== "QUEUED") return conflict("Só é possível reordenar quem está na fila.");
  if (!Number.isInteger(targetIndex)) return badRequest("Informe a nova posição na fila.");

  const moved = await prisma.$transaction(async (tx) => {
    const queued = await tx.seller.findMany({
      where: { queueStatus: "QUEUED" },
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
      details: { posicaoAnterior: moved.from, posicaoNova: moved.to, totalNaFila: moved.total },
    });
  }

  return NextResponse.json({ ok: true });
}
