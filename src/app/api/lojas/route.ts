import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { passwordChangeRequired, unauthorized } from "@/lib/http";
import { loadStoreContext } from "@/lib/stores";

export const dynamic = "force-dynamic";

/**
 * Lojas que a sessão enxerga e qual delas está aberta. É o que o seletor do
 * topo e os formulários de cadastro precisam saber — nunca a lista completa.
 */
export async function GET() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();

  const context = await loadStoreContext(session.user);

  return NextResponse.json({
    stores: context.stores,
    activeStoreId: context.active?.id ?? null,
    canSwitch: context.canSwitch,
  });
}
