import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadSellerViews } from "@/lib/dashboard-data";
import { formatOperationDate } from "@/lib/operation-day";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/app/shell";
import { QueueBoard } from "./queue-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fila · ksales" };

export default async function QueuePage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");

  const [sellers, queued] = await Promise.all([
    loadSellerViews(session.actor),
    prisma.seller.count({ where: { active: true, queueStatus: "QUEUED" } }),
  ]);

  return (
    <AppShell user={session.user} section="queue" breadcrumb="Fila de vendedores" queueCount={queued}>
      <QueueBoard user={session.user} today={formatOperationDate(new Date())} initialSellers={sellers} />
    </AppShell>
  );
}
