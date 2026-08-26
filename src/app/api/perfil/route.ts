import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { badRequest, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { validatePhotoUrl } from "@/lib/seller-rules";

export const dynamic = "force-dynamic";

export const MAX_DESCRIPTION_LENGTH = 400;

/**
 * Edição do próprio perfil: foto e descrição, e nada além disso.
 *
 * Nome não entra. Para vendedor é dado operacional — é o nome que aparece na
 * fila e fica com a supervisão. Para os demais é a identidade que assina a
 * trilha de auditoria, e quem a define é quem cadastrou a conta.
 */
export async function PATCH(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const body = await readJson(request);
  const data: { description?: string | null; photoUrl?: string | null } = {};

  if (typeof body.description === "string") {
    const description = body.description.trim();
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return badRequest(`Descrição pode ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`);
    }
    data.description = description || null;
  }

  if (body.photoUrl !== undefined) {
    const check = validatePhotoUrl(body.photoUrl);
    if (!check.ok) return badRequest(check.error);
    data.photoUrl = check.value;
  }

  const { sellerId, id: userId } = session.user;

  // URL e upload são exclusivos: informar uma URL descarta a imagem salva.
  if (data.photoUrl) {
    if (sellerId) await prisma.sellerPhoto.deleteMany({ where: { sellerId } });
    else await prisma.userPhoto.deleteMany({ where: { userId } });
  }

  const saved = sellerId
    ? await prisma.seller.update({
        where: { id: sellerId },
        data,
        select: { id: true, name: true, description: true, photoUrl: true },
      })
    : await prisma.user.update({
        where: { id: userId },
        data,
        select: { id: true, name: true, description: true, photoUrl: true },
      });

  await recordAudit({
    action: "PROFILE_UPDATED",
    actor: auditActor(session.user),
    target: { id: saved.id, name: saved.name },
    details: { campos: Object.keys(data), origem: sellerId ? "cadastro_de_vendedor" : "propria_conta" },
  });

  return NextResponse.json(saved);
}
