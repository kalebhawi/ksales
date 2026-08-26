import type { Actor } from "@/lib/authz";
import { operationDayRange } from "@/lib/operation-day";
import type { DateRange } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { SELLER_VIEW_QUERY, toSellerView, type SellerView } from "@/lib/seller-view";
import { relativeChange } from "@/lib/format";
import { loadOperationStats } from "@/lib/stats";

export type DashboardMetrics = {
  sales: number;
  salesChange: number | null;
  conversion: number;
  conversionChange: number | null;
  calls: number;
  callsChange: number | null;
  inService: number;
  queued: number;
};

/**
 * Vendedores de uma loja. Sem loja ativa a lista é vazia de propósito: é o que
 * um supervisor sem vínculo deve ver, e nunca a operação inteira.
 */
export async function loadSellerViews(actor: Actor | null, storeId: string | null): Promise<SellerView[]> {
  if (!storeId) return [];

  const { from, to } = operationDayRange(new Date());

  const [sellers, { bySeller }] = await Promise.all([
    prisma.seller.findMany({
      where: { active: true, storeId },
      orderBy: [{ queuePosition: "asc" }, { name: "asc" }],
      include: SELLER_VIEW_QUERY,
    }),
    loadOperationStats(from, to, storeId),
  ]);

  return sellers.map((seller) => toSellerView(seller, bySeller, actor));
}

/**
 * Vendedores com os números do período escolhido. Diferente de
 * `loadSellerViews`, inclui quem foi desativado depois mas atendeu dentro do
 * período — senão o ranking de um mês fechado perderia gente sem avisar.
 *
 * Situação na fila e horário continuam sendo o agora: são estado, não histórico.
 */
export async function loadDashboardSellers(
  actor: Actor | null,
  range: DateRange,
  storeId: string | null,
): Promise<SellerView[]> {
  if (!storeId) return [];

  const { bySeller } = await loadOperationStats(range.from, range.to, storeId);

  const sellers = await prisma.seller.findMany({
    where: { storeId, OR: [{ active: true }, { id: { in: [...bySeller.keys()] } }] },
    orderBy: [{ queuePosition: "asc" }, { name: "asc" }],
    include: SELLER_VIEW_QUERY,
  });

  return sellers.map((seller) => toSellerView(seller, bySeller, actor));
}

/**
 * `inService` e `queued` são sempre o estado atual da loja ativa, mesmo com um
 * período passado selecionado: não existe "quem estava em atendimento" como
 * número de fechamento, e o menu lateral usa esse contador.
 */
export async function loadDashboardMetrics(
  range: DateRange,
  previousRange: DateRange,
  storeId: string | null,
): Promise<DashboardMetrics> {
  const [current, previous, inService, queued] = await Promise.all([
    loadOperationStats(range.from, range.to, storeId),
    loadOperationStats(previousRange.from, previousRange.to, storeId),
    storeId ? prisma.seller.count({ where: { storeId, active: true, queueStatus: "IN_SERVICE" } }) : 0,
    storeId ? prisma.seller.count({ where: { storeId, active: true, queueStatus: "QUEUED" } }) : 0,
  ]);

  return {
    sales: current.totals.sales,
    salesChange: relativeChange(current.totals.sales, previous.totals.sales),
    conversion: current.totals.conversion,
    conversionChange: relativeChange(current.totals.conversion, previous.totals.conversion),
    calls: current.totals.calls,
    callsChange: relativeChange(current.totals.calls, previous.totals.calls),
    inService,
    queued,
  };
}
