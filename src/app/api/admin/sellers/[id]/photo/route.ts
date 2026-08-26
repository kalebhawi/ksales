import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { canManageSellerRegistry } from "@/lib/authz";
import { badRequest, forbidden, notFound, passwordChangeRequired, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { MAX_PHOTO_BYTES, formatBytes, validatePhotoUpload } from "@/lib/seller-rules";

export const dynamic = "force-dynamic";

/** Upload da foto do vendedor. `multipart/form-data`, campo `file`. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/sellers/[id]/photo">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSellerRegistry(session.actor)) return forbidden();

  const { id } = await ctx.params;
  const seller = await prisma.seller.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!seller) return notFound("Vendedor não encontrado.");

  let file: unknown;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return badRequest("Envio inválido. Use multipart/form-data com o campo “file”.");
  }

  if (!(file instanceof File)) return badRequest("Selecione um arquivo de imagem.");

  // Barreira barata antes de ler o corpo inteiro na memória.
  if (file.size > MAX_PHOTO_BYTES) {
    return badRequest(`A imagem tem ${formatBytes(file.size)} e o limite é ${formatBytes(MAX_PHOTO_BYTES)}.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Valida pelo conteúdo, não pelo tipo declarado no upload.
  const check = validatePhotoUpload(bytes);
  if (!check.ok) return badRequest(check.error);

  const photo = await prisma.sellerPhoto.upsert({
    where: { sellerId: id },
    update: { mimeType: check.value, byteSize: bytes.byteLength, data: bytes },
    create: { sellerId: id, mimeType: check.value, byteSize: bytes.byteLength, data: bytes },
    select: { mimeType: true, byteSize: true, updatedAt: true },
  });

  // A foto enviada tem precedência: zera a URL externa para não ficar ambíguo.
  await prisma.seller.update({ where: { id }, data: { photoUrl: null } });

  await recordAudit({
    action: "SELLER_PHOTO_UPDATED",
    actor: auditActor(session.user),
    target: { id: seller.id, name: seller.name },
    details: { origem: "cadastro_administrativo", tipo: photo.mimeType, bytes: photo.byteSize },
  });

  return NextResponse.json({ ok: true, mimeType: photo.mimeType, byteSize: photo.byteSize });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/sellers/[id]/photo">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageSellerRegistry(session.actor)) return forbidden();

  const { id } = await ctx.params;
  const seller = await prisma.seller.findUnique({ where: { id }, select: { name: true } });
  const { count } = await prisma.sellerPhoto.deleteMany({ where: { sellerId: id } });

  if (count > 0 && seller) {
    await recordAudit({
      action: "SELLER_PHOTO_REMOVED",
      actor: auditActor(session.user),
      target: { id, name: seller.name },
      details: { origem: "cadastro_administrativo" },
    });
  }

  return NextResponse.json({ ok: true });
}
