import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageSellerRegistry } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { loadStoreContext } from "@/lib/stores";
import { AppShell } from "@/app/shell";
import { LoadingSwap } from "@/app/app-loading";
import { RowsSkeleton } from "@/app/skeletons";
import { ADMIN_SELLER_SELECT } from "@/app/api/admin/sellers/route";
import { SellersAdmin } from "./sellers-admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vendedores · ksales" };

export default async function SellersAdminPage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");
  if (!canManageSellerRegistry(session.actor)) notFound();

  // O cadastro é o da loja aberta na tela: supervisor de uma loja não vê nem
  // edita gente de outra.
  const store = await loadStoreContext(session.user);

  const sellers = store.active
    ? await prisma.seller.findMany({
        where: { storeId: store.active.id },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: ADMIN_SELLER_SELECT,
      })
    : [];

  // `updatedAt` sai como Date do Prisma e como string do /api/admin/sellers.
  // Normalizo aqui para a tela ver sempre a mesma forma, inclusive após reload.
  const initialSellers = sellers.map((seller) => ({
    ...seller,
    photo: seller.photo && { ...seller.photo, updatedAt: seller.photo.updatedAt.toISOString() },
  }));

  return (
    <AppShell user={session.user} section="sellers" breadcrumb="Vendedores">
      <LoadingSwap skeleton={<RowsSkeleton rows={5} />}>
        <SellersAdmin
          key={store.active?.id ?? "sem-loja"}
          initialSellers={initialSellers}
          stores={store.stores}
          activeStoreId={store.active?.id ?? null}
        />
      </LoadingSwap>
    </AppShell>
  );
}
