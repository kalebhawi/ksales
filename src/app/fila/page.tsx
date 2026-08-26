import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadSellerViews } from "@/lib/dashboard-data";
import { formatOperationDate } from "@/lib/operation-day";
import { prisma } from "@/lib/prisma";
import { activeStoreId } from "@/lib/stores";
import { AppShell } from "@/app/shell";
import { LoadingSwap } from "@/app/app-loading";
import { QueueSkeleton } from "@/app/skeletons";
import { QueueBoard } from "./queue-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fila · ksales" };

export default async function QueuePage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");

  const storeId = await activeStoreId(session.user);

  const [sellers, queued] = await Promise.all([
    loadSellerViews(session.actor, storeId),
    storeId ? prisma.seller.count({ where: { storeId, active: true, queueStatus: "QUEUED" } }) : 0,
  ]);

  return (
    <AppShell user={session.user} section="queue" breadcrumb="Fila de vendedores" queueCount={queued}>
      <LoadingSwap skeleton={<QueueSkeleton />}>
        {/* `key` pela loja: o quadro guarda a lista em estado próprio, e sem
            remontar ele continuaria mostrando os vendedores da loja anterior. */}
        <QueueBoard
          key={storeId ?? "sem-loja"}
          user={session.user}
          today={formatOperationDate(new Date())}
          initialSellers={sellers}
        />
      </LoadingSwap>
    </AppShell>
  );
}
