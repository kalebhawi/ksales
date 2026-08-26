import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/auth";
import { BASE_PATH } from "@/lib/base-path";
import { isAdmin, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { STORE_COOKIE, pickActiveStore, sortStores, type StoreOption } from "@/lib/store-rules";

/**
 * Lojas que uma pessoa enxerga e qual delas está olhando agora.
 *
 * Administrador vê todas as lojas ativas. Supervisor vê as que lhe foram
 * vinculadas. Vendedor vê a do próprio cadastro — e só ela, então para ele o
 * seletor é um rótulo, não um menu.
 */
export type StoreContext = {
  stores: StoreOption[];
  active: StoreOption | null;
  /** Falso para vendedor e para quem tem uma loja só: não há o que trocar. */
  canSwitch: boolean;
};

const STORE_FIELDS = { id: true, name: true, active: true } as const;

export async function allowedStores(user: Pick<SessionUser, "isAdmin" | "id" | "sellerStoreId">): Promise<StoreOption[]> {
  if (user.isAdmin) {
    return sortStores(await prisma.store.findMany({ where: { active: true }, select: STORE_FIELDS }));
  }

  const stores = await prisma.store.findMany({
    where: {
      active: true,
      OR: [
        { users: { some: { userId: user.id } } },
        ...(user.sellerStoreId ? [{ id: user.sellerStoreId }] : []),
      ],
    },
    select: STORE_FIELDS,
  });

  return sortStores(stores);
}

/**
 * O cookie diz o que a pessoa escolheu; a lista de permitidas diz o que ela
 * pode ver. Quem decide é a lista — cookie apontando para loja não permitida
 * cai na primeira, sem erro e sem vazar nada.
 */
export async function loadStoreContext(user: SessionUser): Promise<StoreContext> {
  const stores = await allowedStores(user);
  const requested = (await cookies()).get(STORE_COOKIE)?.value ?? null;
  const active = pickActiveStore(stores, requested);

  return { stores, active, canSwitch: stores.length > 1 };
}

/** Só a loja ativa, para quem não precisa da lista inteira. */
export async function activeStoreId(user: SessionUser): Promise<string | null> {
  return (await loadStoreContext(user)).active?.id ?? null;
}

export async function setActiveStoreCookie(storeId: string) {
  const store = await cookies();

  store.set(STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: BASE_PATH,
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Confere no banco se o ator pode agir sobre uma loja. Administrador passa em
 * qualquer uma ativa; os demais só nas vinculadas.
 */
export async function assertStoreAccess(actor: Actor, storeId: string): Promise<boolean> {
  if (isAdmin(actor)) {
    return Boolean(await prisma.store.findFirst({ where: { id: storeId, active: true }, select: { id: true } }));
  }

  return actor.storeIds.includes(storeId);
}
