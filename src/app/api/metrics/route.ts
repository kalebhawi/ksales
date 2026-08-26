import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { canViewDashboard } from "@/lib/authz";
import { loadDashboardMetrics } from "@/lib/dashboard-data";
import { forbidden, passwordChangeRequired, unauthorized } from "@/lib/http";
import { parsePeriod, resolvePeriod } from "@/lib/period";
import { activeStoreId } from "@/lib/stores";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  // Os números da visão geral são de supervisão: vendedor não acessa nem pela API.
  if (!canViewDashboard(session.actor)) return forbidden();

  // Mesmos parâmetros da tela, para a API e a página nunca divergirem.
  const { spec } = parsePeriod(Object.fromEntries(new URL(request.url).searchParams));
  const period = resolvePeriod(spec, new Date());

  return NextResponse.json(
    await loadDashboardMetrics(period.range, period.previous, await activeStoreId(session.user)),
  );
}
