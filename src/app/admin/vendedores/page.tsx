import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageSellerRegistry } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/app/shell";
import { ADMIN_SELLER_SELECT } from "@/app/api/admin/sellers/route";
import { SellersAdmin } from "./sellers-admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vendedores · ksales" };

export default async function SellersAdminPage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");
  if (!canManageSellerRegistry(session.actor)) notFound();

  const sellers = await prisma.seller.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: ADMIN_SELLER_SELECT,
  });

  // `updatedAt` sai como Date do Prisma e como string do /api/admin/sellers.
  // Normalizo aqui para a tela ver sempre a mesma forma, inclusive após reload.
  const initialSellers = sellers.map((seller) => ({
    ...seller,
    photo: seller.photo && { ...seller.photo, updatedAt: seller.photo.updatedAt.toISOString() },
  }));

  return (
    <AppShell user={session.user} section="sellers" breadcrumb="Vendedores">
      <SellersAdmin initialSellers={initialSellers} />
    </AppShell>
  );
}
