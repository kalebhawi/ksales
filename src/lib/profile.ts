import type { SessionUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/authz";
import { apiUrl } from "@/lib/base-path";
import { formatPercent, initialsOf, toneOf } from "@/lib/format";
import { operationDayRange } from "@/lib/operation-day";
import { prisma } from "@/lib/prisma";
import { UI_STATUS_BY_QUEUE_STATUS, type SellerUiStatus } from "@/lib/seller-view";
import { loadOperationStats, statsFor } from "@/lib/stats";

/**
 * Perfil da própria sessão, venha de onde vier.
 *
 * Vendedor tem foto e descrição no cadastro — são o que aparece na fila. Quem
 * não é vendedor guarda as suas em `users`. A tela e as rotas de perfil falam
 * só com esta forma única e não precisam saber qual das duas é.
 */
export type ProfileSeller = {
  badgeNumber: string;
  level: number;
  status: SellerUiStatus;
  calls: number;
  sales: number;
  conversion: string;
};

export type ProfileView = {
  name: string;
  email: string;
  role: string;
  initials: string;
  tone: string;
  /** Sempre `/api/perfil/photo` quando há upload — a tela não distingue a origem. */
  photoUrl: string | null;
  externalPhotoUrl: string;
  hasUpload: boolean;
  description: string;
  seller: ProfileSeller | null;
};

export async function loadProfile(user: SessionUser): Promise<ProfileView> {
  const base = {
    name: user.name,
    email: user.email,
    role: ROLE_LABELS[user.role],
    initials: initialsOf(user.sellerName ?? user.name),
    tone: toneOf(user.sellerId ?? user.email),
  };

  if (user.sellerId) {
    const { from, to } = operationDayRange(new Date());

    const [seller, { bySeller }] = await Promise.all([
      prisma.seller.findUnique({
        where: { id: user.sellerId },
        select: {
          name: true,
          badgeNumber: true,
          level: true,
          description: true,
          photoUrl: true,
          queueStatus: true,
          photo: { select: { updatedAt: true } },
        },
      }),
      loadOperationStats(from, to),
    ]);

    if (seller) {
      const stats = statsFor(bySeller, user.sellerId);

      return {
        ...base,
        name: seller.name,
        initials: initialsOf(seller.name),
        tone: toneOf(seller.badgeNumber || user.sellerId),
        photoUrl: photoLink(seller.photo?.updatedAt) ?? seller.photoUrl,
        externalPhotoUrl: seller.photo ? "" : seller.photoUrl ?? "",
        hasUpload: seller.photo != null,
        description: seller.description ?? "",
        seller: {
          badgeNumber: seller.badgeNumber,
          level: seller.level,
          status: UI_STATUS_BY_QUEUE_STATUS[seller.queueStatus],
          calls: stats.calls,
          sales: stats.sales,
          conversion: formatPercent(stats.conversion),
        },
      };
    }
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { description: true, photoUrl: true, photo: { select: { updatedAt: true } } },
  });

  return {
    ...base,
    photoUrl: photoLink(account?.photo?.updatedAt) ?? account?.photoUrl ?? null,
    externalPhotoUrl: account?.photo ? "" : account?.photoUrl ?? "",
    hasUpload: account?.photo != null,
    description: account?.description ?? "",
    seller: null,
  };
}

/** O `v` invalida o cache do navegador quando a pessoa troca a imagem. */
function photoLink(updatedAt: Date | undefined) {
  return updatedAt ? `${apiUrl("/perfil/photo")}?v=${updatedAt.getTime()}` : null;
}
