import { NextResponse } from "next/server";
import { STORE_SELECT, toStoreView } from "@/app/api/admin/lojas/route";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { canManageStores } from "@/lib/authz";
import { badRequest, conflict, forbidden, notFound, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { validateStoreName } from "@/lib/store-rules";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/lojas/[id]">) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageStores(session.actor)) return forbidden();

  const { id } = await ctx.params;
  const store = await prisma.store.findUnique({ where: { id }, select: { id: true, name: true, active: true } });
  if (!store) return notFound("Loja não encontrada.");

  const body = await readJson(request);
  const data: { name?: string; active?: boolean } = {};

  if (body.name !== undefined) {
    const check = validateStoreName(body.name);
    if (!check.ok) return badRequest(check.error);

    const taken = await prisma.store.findUnique({ where: { name: check.value }, select: { id: true } });
    if (taken && taken.id !== id) return conflict("Já existe uma loja com este nome.");

    data.name = check.value;
  }

  if (typeof body.active === "boolean") {
    // Desativar uma loja tira do ar a fila e o cadastro dela. Com vendedor
    // ativo dentro, isso deixaria gente sem loja nenhuma para aparecer.
    if (!body.active) {
      const sellers = await prisma.seller.count({ where: { storeId: id, active: true } });
      if (sellers > 0) {
        return conflict(
          `Esta loja ainda tem ${sellers} vendedor(es) ativo(s). Transfira ou desative essas pessoas antes.`,
        );
      }
    }

    data.active = body.active;
  }

  const updated = await prisma.store.update({ where: { id }, data, select: STORE_SELECT });

  await recordAudit({
    action: "STORE_UPDATED",
    actor: auditActor(session.user),
    target: { id: updated.id, name: updated.name },
    store: { id: updated.id, name: updated.name },
    details: {
      campos: Object.keys(data),
      ...(store.name !== updated.name ? { nomeAnterior: store.name } : {}),
      ...(data.active !== undefined ? { ativa: updated.active } : {}),
    },
  });

  return NextResponse.json(toStoreView(updated));
}
