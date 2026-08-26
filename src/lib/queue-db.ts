import type { prisma } from "@/lib/prisma";

/**
 * Posições da fila no banco. A fila é por loja: toda consulta aqui recebe
 * `storeId` e nenhuma delas enxerga vendedor de outra.
 *
 * Vive fora das rotas porque a fila é mexida em três lugares — operar a fila,
 * concluir um atendimento e transferir alguém de loja — e as três precisam
 * renumerar do mesmo jeito.
 */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Fim da fila da loja. */
export async function nextQueuePosition(tx: Tx, storeId: string) {
  const last = await tx.seller.findFirst({
    where: { storeId, queueStatus: "QUEUED" },
    orderBy: { queuePosition: "desc" },
    select: { queuePosition: true },
  });

  return (last?.queuePosition ?? 0) + 1;
}

/**
 * Renumera a fila da loja para 1..n. Chamada sempre que alguém sai do meio da
 * fila, senão sobra um buraco na numeração que a tela mostraria como posição.
 */
export async function resequenceQueue(tx: Tx, storeId: string) {
  const queued = await tx.seller.findMany({
    where: { storeId, queueStatus: "QUEUED" },
    orderBy: [{ queuePosition: "asc" }, { updatedAt: "asc" }],
    select: { id: true, queuePosition: true },
  });

  for (const [index, entry] of queued.entries()) {
    if (entry.queuePosition !== index + 1) {
      await tx.seller.update({ where: { id: entry.id }, data: { queuePosition: index + 1 } });
    }
  }
}
