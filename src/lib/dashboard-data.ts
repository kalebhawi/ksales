import type { Actor } from "@/lib/authz";
import { operationDayRange } from "@/lib/operation-day";
import type { DateRange } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { SELLER_VIEW_QUERY, toSellerView, type SellerView } from "@/lib/seller-view";
import { relativeChange } from "@/lib/format";
import { loadOperationStats, type OperationTotals, type SellerStats } from "@/lib/stats";

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
 * Vendedores com os números já apurados do período. Diferente de
 * `loadSellerViews`, inclui quem foi desativado depois mas atendeu dentro do
 * período — senão o ranking de um mês fechado perderia gente sem avisar.
 *
 * Situação na fila e horário continuam sendo o agora: são estado, não histórico.
 */
async function sellersForPeriod(
  actor: Actor | null,
  bySeller: Map<string, SellerStats>,
  storeId: string,
): Promise<SellerView[]> {
  const sellers = await prisma.seller.findMany({
    where: { storeId, OR: [{ active: true }, { id: { in: [...bySeller.keys()] } }] },
    orderBy: [{ queuePosition: "asc" }, { name: "asc" }],
    include: SELLER_VIEW_QUERY,
  });

  return sellers.map((seller) => toSellerView(seller, bySeller, actor));
}

/**
 * Tudo o que a visão geral precisa, com a apuração do período feita **uma vez**.
 *
 * Antes eram duas funções independentes, e cada uma apurava o mesmo período por
 * conta própria: a agregação mais cara da tela rodava em dobro a cada carga.
 */
export async function loadDashboard(
  actor: Actor | null,
  range: DateRange,
  previousRange: DateRange,
  storeId: string | null,
): Promise<{ sellers: SellerView[]; metrics: DashboardMetrics }> {
  const [current, previous] = await Promise.all([
    loadOperationStats(range.from, range.to, storeId),
    loadOperationStats(previousRange.from, previousRange.to, storeId),
  ]);

  const [sellers, counters] = await Promise.all([
    storeId ? sellersForPeriod(actor, current.bySeller, storeId) : [],
    liveCounters(storeId),
  ]);

  return { sellers, metrics: buildMetrics(current.totals, previous.totals, counters) };
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
  const [current, previous, counters] = await Promise.all([
    loadOperationStats(range.from, range.to, storeId),
    loadOperationStats(previousRange.from, previousRange.to, storeId),
    liveCounters(storeId),
  ]);

  return buildMetrics(current.totals, previous.totals, counters);
}

async function liveCounters(storeId: string | null) {
  if (!storeId) return { inService: 0, queued: 0 };

  const [inService, queued] = await Promise.all([
    prisma.seller.count({ where: { storeId, active: true, queueStatus: "IN_SERVICE" } }),
    prisma.seller.count({ where: { storeId, active: true, queueStatus: "QUEUED" } }),
  ]);

  return { inService, queued };
}

function buildMetrics(
  current: OperationTotals,
  previous: OperationTotals,
  counters: { inService: number; queued: number },
): DashboardMetrics {
  return {
    sales: current.sales,
    salesChange: relativeChange(current.sales, previous.sales),
    conversion: current.conversion,
    conversionChange: relativeChange(current.conversion, previous.conversion),
    calls: current.calls,
    callsChange: relativeChange(current.calls, previous.calls),
    ...counters,
  };
}
