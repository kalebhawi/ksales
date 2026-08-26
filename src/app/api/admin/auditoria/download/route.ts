import { auditRangeFileName, isAuditDate } from "@/lib/audit-events";
import { auditActor, listAuditFiles, readAuditFile, recordAudit } from "@/lib/audit-log";
import { getActor } from "@/lib/auth";
import { canDownloadAuditLog } from "@/lib/authz";
import { badRequest, forbidden, notFound, passwordChangeRequired, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Baixa a trilha de um dia (`?dia=2026-08-26`) ou de um período
 * (`?de=...&ate=...`, dias existentes concatenados em ordem).
 *
 * Nenhum nome de arquivo vem do cliente: as datas são validadas e o nome é
 * montado por `auditFileName`, o que fecha a porta para travessia de diretório.
 */
export async function GET(request: Request) {
  const session = await getActor();
  if (!session) return unauthorized();
  if (session.user.mustChangePassword) return passwordChangeRequired();
  if (!canDownloadAuditLog(session.actor)) return forbidden();

  const params = new URL(request.url).searchParams;
  const day = params.get("dia");
  const from = params.get("de") ?? day;
  const to = params.get("ate") ?? day;

  if (!isAuditDate(from) || !isAuditDate(to)) {
    return badRequest("Informe uma data válida (aaaa-mm-dd).");
  }

  // Datas invertidas viram ordem certa, igual ao filtro da visão geral.
  const [start, end] = from <= to ? [from, to] : [to, from];

  const days = (await listAuditFiles())
    .filter((file) => file.date >= start && file.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (days.length === 0) {
    return notFound("Nenhum registro de auditoria neste período.");
  }

  const parts: string[] = [];
  for (const file of days) {
    const content = await readAuditFile(file.date);
    if (content) parts.push(content.endsWith("\n") ? content : `${content}\n`);
  }

  const body = parts.join("");
  const fileName = auditRangeFileName(start, end);

  // O acesso à trilha também é uma ação: fica registrado nela.
  await recordAudit({
    action: "AUDIT_LOG_DOWNLOADED",
    actor: auditActor(session.user),
    details: { de: start, ate: end, dias: days.length, linhas: days.reduce((sum, f) => sum + f.entries, 0) },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
