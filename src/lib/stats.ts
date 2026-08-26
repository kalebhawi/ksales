import { conversionRate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type SellerStats = {
  calls: number;
  completed: number;
  sales: number;
  conversion: number;
};

export type OperationTotals = SellerStats;

const EMPTY: SellerStats = { calls: 0, completed: 0, sales: 0, conversion: 0 };

export async function loadOperationStats(from: Date, to: Date) {
  const grouped = await prisma.atendimento.groupBy({
    by: ["sellerId", "status", "action"],
    where: { startedAt: { gte: from, lt: to } },
    _count: { _all: true },
  });

  const bySeller = new Map<string, SellerStats>();
  const totals: SellerStats = { ...EMPTY };

  for (const row of grouped) {
    const current = bySeller.get(row.sellerId) ?? { ...EMPTY };
    const count = row._count._all;

    current.calls += count;
    totals.calls += count;

    if (row.status === "COMPLETED") {
      current.completed += count;
      totals.completed += count;

      if (row.action === "SALE_CONVERTED") {
        current.sales += count;
        totals.sales += count;
      }
    }

    current.conversion = conversionRate(current.sales, current.completed);
    bySeller.set(row.sellerId, current);
  }

  totals.conversion = conversionRate(totals.sales, totals.completed);

  return { bySeller, totals };
}

export function statsFor(bySeller: Map<string, SellerStats>, sellerId: string): SellerStats {
  return bySeller.get(sellerId) ?? { ...EMPTY };
}
