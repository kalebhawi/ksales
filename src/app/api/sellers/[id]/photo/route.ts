import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { notFound, passwordChangeRequired, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Serve a foto guardada em `seller_photos`. Exige sessão: a lista de vendedores
 * não é pública, e a foto faz parte dela.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/sellers/[id]/photo">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const { id } = await ctx.params;
  const photo = await prisma.sellerPhoto.findUnique({ where: { sellerId: id } });
  if (!photo) return notFound("Este vendedor não tem foto salva.");

  // O ETag muda junto com a foto, então o navegador revalida barato em vez de
  // baixar o blob a cada render da fila.
  const etag = `"${id}-${photo.updatedAt.getTime()}"`;
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
