import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadDashboardMetrics, loadDashboardSellers } from "@/lib/dashboard-data";
import { formatOperationDate, operationDateParts } from "@/lib/operation-day";
import { parsePeriod, resolvePeriod, toYmd } from "@/lib/period";
import { activeStoreId } from "@/lib/stores";
import { Dashboard } from "./dashboard";
import { LoadingSwap } from "./app-loading";
import { DashboardSkeleton } from "./skeletons";
import { AppShell } from "./shell";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");

  // A visão geral é tela de supervisão: vendedor entra direto na fila.
  if (!session.user.canViewDashboard) redirect("/fila");

  const now = new Date();
  const { spec, error } = parsePeriod(await searchParams);
  const period = resolvePeriod(spec, now);

  const storeId = await activeStoreId(session.user);

  const [sellers, metrics] = await Promise.all([
    loadDashboardSellers(session.actor, period.range, storeId),
    loadDashboardMetrics(period.range, period.previous, storeId),
  ]);

  return (
    <AppShell user={session.user} section="overview" breadcrumb="Visão geral" queueCount={metrics.queued}>
      <LoadingSwap skeleton={<DashboardSkeleton />}>
        <Dashboard
          user={session.user}
          today={formatOperationDate(now)}
          todayYmd={toYmd(operationDateParts(now))}
          period={period}
          periodError={error}
          metrics={metrics}
          sellers={sellers}
        />
      </LoadingSwap>
    </AppShell>
  );
}
