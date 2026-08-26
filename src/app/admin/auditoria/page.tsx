import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canDownloadAuditLog } from "@/lib/authz";
import { listAuditFiles, queryAuditEntries } from "@/lib/audit-log";
import { operationDateParts } from "@/lib/operation-day";
import { toYmd } from "@/lib/period";
import { AppShell } from "@/app/shell";
import { AuditAdmin } from "./audit-admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Auditoria · ksales" };

export default async function AuditPage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");

  // `notFound` e não `forbidden`: quem não é administrador nem descobre que a tela existe.
  if (!canDownloadAuditLog(session.actor)) notFound();

  // Primeira página já renderizada no servidor: a tabela abre preenchida.
  const [files, entries] = await Promise.all([listAuditFiles(), queryAuditEntries()]);

  return (
    <AppShell user={session.user} section="audit" breadcrumb="Auditoria">
      <AuditAdmin
        initialFiles={files}
        initialEntries={entries}
        todayYmd={toYmd(operationDateParts(new Date()))}
      />
    </AppShell>
  );
}
