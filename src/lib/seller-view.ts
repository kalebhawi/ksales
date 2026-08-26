import type { Actor } from "@/lib/authz";
import { apiUrl } from "@/lib/base-path";
import { canManageSeller } from "@/lib/authz";
import { formatOperationTime } from "@/lib/operation-day";
import { REMOVAL_REASON_LABELS, isRemovalReason, type QueueStatus } from "@/lib/queue";
import { formatPercent, initialsOf, toneOf } from "@/lib/format";
import { statsFor, type SellerStats } from "@/lib/stats";

export type SellerUiStatus = "fila" | "atendimento" | "fora";

export const UI_STATUS_BY_QUEUE_STATUS: Record<QueueStatus, SellerUiStatus> = {
  QUEUED: "fila",
  IN_SERVICE: "atendimento",
  OFF_SHIFT: "fora",
};

export type SellerView = {
  id: string;
  name: string;
  initials: string;
  tone: string;
  badgeNumber: string;
  level: number;
  photoUrl: string | null;
  description: string;
  status: SellerUiStatus;
  queuePosition: number | null;
  time: string | null;
  offShiftReason: string | null;
  calls: number;
  sales: number;
  conversion: string;
  canManage: boolean;
};

type SellerRecord = {
  id: string;
  name: string;
  badgeNumber: string;
  level: number;
  photoUrl: string | null;
  description: string | null;
  queueStatus: QueueStatus;
  queuePosition: number | null;
  services: { startedAt: Date }[];
  queueEvents: { createdAt: Date; reason: string | null; notes: string | null }[];
  photo: { updatedAt: Date } | null;
};

export function toSellerView(
  seller: SellerRecord,
  stats: Map<string, SellerStats>,
  actor: Actor | null,
): SellerView {
  const sellerStats = statsFor(stats, seller.id);
  const lastEvent = seller.queueEvents[0];
  const reference =
    seller.queueStatus === "IN_SERVICE" ? seller.services[0]?.startedAt ?? lastEvent?.createdAt : lastEvent?.createdAt;

  return {
    id: seller.id,
    name: seller.name,
    initials: initialsOf(seller.name),
    tone: toneOf(seller.badgeNumber || seller.id),
    badgeNumber: seller.badgeNumber,
    level: seller.level,
    photoUrl: resolvePhotoUrl(seller),
    description: seller.description ?? "",
    status: UI_STATUS_BY_QUEUE_STATUS[seller.queueStatus],
    queuePosition: seller.queuePosition,
    time: reference ? formatOperationTime(reference) : null,
    // Cadastro novo nasce fora do turno sem histórico: aí não há motivo a exibir.
    offShiftReason:
      seller.queueStatus === "OFF_SHIFT" && isRemovalReason(lastEvent?.reason)
        ? lastEvent.notes?.trim() || REMOVAL_REASON_LABELS[lastEvent.reason]
        : null,
    calls: sellerStats.calls,
    sales: sellerStats.sales,
    conversion: formatPercent(sellerStats.conversion),
    canManage: actor ? canManageSeller(actor, seller.id) : false,
  };
}

/**
 * Foto enviada tem precedência sobre URL externa. O `v` no fim invalida o cache
 * do navegador quando o admin troca a imagem.
 */
function resolvePhotoUrl(seller: SellerRecord) {
  if (seller.photo) return `${apiUrl(`/sellers/${seller.id}/photo`)}?v=${seller.photo.updatedAt.getTime()}`;

  return seller.photoUrl;
}

export const SELLER_VIEW_QUERY = {
  services: { where: { status: "IN_PROGRESS" as const }, orderBy: { startedAt: "desc" as const }, take: 1 },
  queueEvents: { orderBy: { createdAt: "desc" as const }, take: 1 },
  // Só o timestamp: o blob nunca entra na consulta da lista.
  photo: { select: { updatedAt: true as const } },
};
