/** Sem "disponível": ou na fila, ou em atendimento, ou fora do turno. */
export type QueueStatus = "QUEUED" | "IN_SERVICE" | "OFF_SHIFT";
export type QueueAction =
  | "ENTERED_QUEUE"
  | "STARTED_SERVICE"
  | "REMOVED_FROM_QUEUE"
  | "RETURNED_TO_QUEUE"
  | "ENDED_SHIFT";

export const QUEUE_OPERATIONS = ["enqueue", "start", "remove", "reorder"] as const;
export type QueueOperation = (typeof QUEUE_OPERATIONS)[number];

/**
 * Operações que valem para a fila inteira, não para um vendedor. Exigem
 * supervisão e rodam em transação única — dois supervisores clicando ao mesmo
 * tempo não podem iniciar o atendimento do mesmo vendedor duas vezes.
 */
export const QUEUE_WIDE_OPERATIONS = ["start_next", "end_shift_all"] as const;
export type QueueWideOperation = (typeof QUEUE_WIDE_OPERATIONS)[number];

export function isQueueWideOperation(value: unknown): value is QueueWideOperation {
  return QUEUE_WIDE_OPERATIONS.includes(value as QueueWideOperation);
}

export const REMOVAL_REASONS = ["encerrar_dia", "intervalo", "banheiro", "outro"] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

export const REMOVAL_REASON_LABELS: Record<RemovalReason, string> = {
  encerrar_dia: "Encerrar dia",
  intervalo: "Intervalo",
  banheiro: "Banheiro",
  outro: "Outro",
};

export type QueueTransition = {
  status: QueueStatus;
  action: QueueAction;
  reason?: RemovalReason;
  notes?: string;
};

export type QueueTransitionResult =
  | { ok: true; transition: QueueTransition }
  | { ok: false; error: string };

export function isQueueOperation(value: unknown): value is QueueOperation {
  return QUEUE_OPERATIONS.includes(value as QueueOperation);
}

export function isRemovalReason(value: unknown): value is RemovalReason {
  return REMOVAL_REASONS.includes(value as RemovalReason);
}

/**
 * Regras de transição da fila. Função pura: não toca o banco, só decide o
 * próximo estado do vendedor e o evento que precisa ser registrado.
 */
export function planQueueTransition(
  current: QueueStatus,
  operation: QueueOperation,
  input: { reason?: unknown; notes?: unknown } = {},
): QueueTransitionResult {
  if (operation === "enqueue") {
    if (current === "QUEUED") return { ok: false, error: "Vendedor já está na fila." };
    if (current === "IN_SERVICE") return { ok: false, error: "Conclua o atendimento antes de voltar para a fila." };

    // Sempre ENTERED_QUEUE: alguém colocou o vendedor na fila. RETURNED_TO_QUEUE
    // ficou reservado para a volta automática depois de concluir um atendimento.
    return { ok: true, transition: { status: "QUEUED", action: "ENTERED_QUEUE" } };
  }

  if (operation === "start") {
    if (current !== "QUEUED") return { ok: false, error: "Só é possível iniciar atendimento de quem está na fila." };

    return { ok: true, transition: { status: "IN_SERVICE", action: "STARTED_SERVICE" } };
  }

  if (operation === "remove") {
    if (current === "IN_SERVICE") return { ok: false, error: "Conclua o atendimento antes de sair da fila." };
    if (current === "OFF_SHIFT") return { ok: false, error: "Vendedor já está fora do turno." };
    if (!isRemovalReason(input.reason)) return { ok: false, error: "Motivo da saída é obrigatório." };

    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (input.reason === "outro" && notes.length === 0) {
      return { ok: false, error: "Descreva o motivo quando selecionar “Outro”." };
    }

    return {
      ok: true,
      transition: {
        status: "OFF_SHIFT",
        action: input.reason === "encerrar_dia" ? "ENDED_SHIFT" : "REMOVED_FROM_QUEUE",
        reason: input.reason,
        notes: notes || undefined,
      },
    };
  }

  return { ok: false, error: "Operação de fila inválida." };
}

/**
 * Reposiciona `sellerId` dentro da fila e devolve as posições normalizadas
 * (1..n) de todos os vendedores enfileirados.
 */
export function reorderQueue(queue: string[], sellerId: string, targetIndex: number) {
  const from = queue.indexOf(sellerId);
  if (from === -1) return null;

  const next = queue.slice();
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, sellerId);

  return next.map((id, index) => ({ id, queuePosition: index + 1 }));
}
