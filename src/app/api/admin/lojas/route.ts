import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { canManageStores } from "@/lib/authz";
import { badRequest, conflict, forbidden, passwordChangeRequired, readJson, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { sortStores, validateStoreName } from "@/lib/store-rules";

export const dynamic = "force-dynamic";

export const STORE_SELECT = {
  id: true,
  name: true,
  active: true,
  createdAt: true,
  _count: { select: { sellers: true } },
} as const;

type StoreRecord = { createdAt: Date };

export function toStoreView<T extends StoreRecord>(store: T) {
  return { ...store, createdAt: store.createdAt.toISOString() };
}

/** Lista completa, inativas incluídas: é a tela de cadastro, não o seletor. */
export async function GET() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageStores(session.actor)) return forbidden();

  const stores = await prisma.store.findMany({ select: STORE_SELECT });

  return NextResponse.json(sortStores(stores).map(toStoreView));
}

export async function POST(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canManageStores(session.actor)) return forbidden();

  const body = await readJson(request);
  const check = validateStoreName(body.name);
  if (!check.ok) return badRequest(check.error);

  if (await prisma.store.findUnique({ where: { name: check.value }, select: { id: true } })) {
    return conflict("Já existe uma loja com este nome.");
  }

  const store = await prisma.store.create({ data: { name: check.value }, select: STORE_SELECT });

  await recordAudit({
    action: "STORE_CREATED",
    actor: auditActor(session.user),
    target: { id: store.id, name: store.name },
    store: { id: store.id, name: store.name },
    details: { origem: "cadastro_de_loja" },
  });

  return NextResponse.json(toStoreView(store), { status: 201 });
}
