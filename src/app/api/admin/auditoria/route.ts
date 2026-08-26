import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { canDownloadAuditLog } from "@/lib/authz";
import { listAuditFiles } from "@/lib/audit-log";
import { forbidden, passwordChangeRequired, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Dias disponíveis na trilha. O conteúdo em si sai por `/download`. */
export async function GET() {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canDownloadAuditLog(session.actor)) return forbidden();

  return NextResponse.json(await listAuditFiles());
}
