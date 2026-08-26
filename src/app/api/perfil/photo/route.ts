import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { badRequest, notFound, passwordChangeRequired, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { MAX_PHOTO_BYTES, formatBytes, validatePhotoUpload } from "@/lib/seller-rules";

export const dynamic = "force-dynamic";

/**
 * Foto do próprio perfil. Vendedor grava em `seller_photos` — é a foto que
 * aparece na fila; quem não é vendedor grava em `user_photos`. A rota é a mesma
 * para os dois, então a tela não precisa saber de onde vem.
 */
export async function GET(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const { sellerId, id: userId } = session.user;

  const photo = sellerId
    ? await prisma.sellerPhoto.findUnique({ where: { sellerId } })
    : await prisma.userPhoto.findUnique({ where: { userId } });

  if (!photo) return notFound("Você não tem foto salva.");

  // ETag muda junto com a foto: o navegador revalida barato em vez de baixar o
  // blob a cada render do topo.
  const etag = `"${sellerId ?? userId}-${photo.updatedAt.getTime()}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.byteSize),
      "Cache-Control": "private, max-age=0, must-revalidate",
      ETag: etag,
    },
  });
}

/** Upload da própria foto. `multipart/form-data`, campo `file`. */
export async function POST(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

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

  const { sellerId, id: userId } = session.user;
  const photo = { mimeType: check.value, byteSize: bytes.byteLength, data: bytes };

  // A foto enviada tem precedência: zera a URL externa para não ficar ambíguo.
  if (sellerId) {
    await prisma.sellerPhoto.upsert({ where: { sellerId }, update: photo, create: { sellerId, ...photo } });
    await prisma.seller.update({ where: { id: sellerId }, data: { photoUrl: null } });
  } else {
    await prisma.userPhoto.upsert({ where: { userId }, update: photo, create: { userId, ...photo } });
    await prisma.user.update({ where: { id: userId }, data: { photoUrl: null } });
  }

  await recordAudit({
    action: "SELLER_PHOTO_UPDATED",
    actor: auditActor(session.user),
    target: { id: sellerId ?? userId, name: session.user.sellerName ?? session.user.name },
    details: { origem: "proprio_perfil", tipo: check.value, bytes: bytes.byteLength },
  });

  return NextResponse.json({ ok: true, mimeType: check.value, byteSize: bytes.byteLength });
}

export async function DELETE() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const { sellerId, id: userId } = session.user;

  const { count } = sellerId
    ? await prisma.sellerPhoto.deleteMany({ where: { sellerId } })
    : await prisma.userPhoto.deleteMany({ where: { userId } });

  if (count > 0) {
    await recordAudit({
      action: "SELLER_PHOTO_REMOVED",
      actor: auditActor(session.user),
      target: { id: sellerId ?? userId, name: session.user.sellerName ?? session.user.name },
      details: { origem: "proprio_perfil" },
    });
  }

  return NextResponse.json({ ok: true });
}
