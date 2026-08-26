import { NextResponse } from "next/server";
import {
  DEFAULT_AUDIT_PAGE_SIZE,
  isAuditAction,
  isAuditDate,
  isAuditPageSize,
  type AuditAction,
} from "@/lib/audit-events";
import { queryAuditEntries } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { canDownloadAuditLog } from "@/lib/authz";
import { badRequest, forbidden, passwordChangeRequired, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Linhas da trilha para a tabela: filtradas e paginadas no servidor, para o
 * arquivo de um dia movimentado não atravessar a rede inteiro.
 */
export async function GET(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canDownloadAuditLog(session.actor)) return forbidden();

  const params = new URL(request.url).searchParams;
  const from = params.get("de");
  const to = params.get("ate");
  const action = params.get("acao");

  if ((from && !isAuditDate(from)) || (to && !isAuditDate(to))) {
    return badRequest("Informe uma data válida (aaaa-mm-dd).");
  }

  if (action && !isAuditAction(action)) return badRequest("Ação desconhecida.");

  const page = Number(params.get("pagina") ?? 1);
  const perPage = params.get("porPagina");

  return NextResponse.json(
    await queryAuditEntries({
      from,
      to,
      action: (action as AuditAction) || null,
      search: params.get("busca") ?? "",
      page: Number.isFinite(page) ? page : 1,
      perPage: isAuditPageSize(perPage) ? Number(perPage) : DEFAULT_AUDIT_PAGE_SIZE,
    }),
  );
}
