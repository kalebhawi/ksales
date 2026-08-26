import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageStores } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { sortStores } from "@/lib/store-rules";
import { STORE_SELECT, toStoreView } from "@/app/api/admin/lojas/route";
import { AppShell } from "@/app/shell";
import { StoresAdmin } from "./stores-admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lojas · ksales" };

export default async function StoresPage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");

  // `notFound` e não `forbidden`: quem não é administrador nem descobre a tela.
  if (!canManageStores(session.actor)) notFound();

  const stores = await prisma.store.findMany({ select: STORE_SELECT });

  return (
    <AppShell user={session.user} section="stores" breadcrumb="Lojas">
      <StoresAdmin initialStores={sortStores(stores).map(toStoreView)} />
    </AppShell>
  );
}
