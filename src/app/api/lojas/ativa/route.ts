import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { badRequest, forbidden, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertStoreAccess, setActiveStoreCookie } from "@/lib/stores";

export const dynamic = "force-dynamic";

/**
 * Troca a loja que a pessoa está olhando.
 *
 * A escolha vai para um cookie, mas ela nunca é a autoridade: toda consulta
 * reconfere o acesso à loja. Aqui o motivo de conferir é outro — devolver erro
 * na hora em vez de deixar a tela recarregar mostrando outra loja calada.
 */
export async function POST(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const body = await readJson(request);
  const storeId = typeof body.storeId === "string" ? body.storeId : "";

  if (!storeId) return badRequest("Informe a loja.");
  if (!(await assertStoreAccess(session.actor, storeId))) return forbidden();

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) return badRequest("Loja inválida.");

  await setActiveStoreCookie(store.id);

  // Fica na trilha: é o que explica por que alguém viu os números de uma loja.
  await recordAudit({
    action: "STORE_SWITCHED",
    actor: auditActor(session.user),
    store,
    details: { origem: "troca_de_loja" },
  });

  return NextResponse.json({ ok: true, store });
}
