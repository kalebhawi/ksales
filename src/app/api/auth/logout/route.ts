import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  // Lido antes de destruir: depois não há mais de quem registrar o logout.
  const user = await getSessionUser();

  await destroySession();

  if (user) await recordAudit({ action: "LOGOUT", actor: auditActor(user), details: { email: user.email } });

  return NextResponse.json({ ok: true });
}
