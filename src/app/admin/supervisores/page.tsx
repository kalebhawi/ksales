import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageSupervisors } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/app/shell";
import { SUPERVISOR_SELECT } from "@/app/api/admin/supervisores/route";
import { SupervisorsAdmin } from "./supervisors-admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Supervisores · ksales" };

export default async function SupervisorsPage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");
  if (!canManageSupervisors(session.actor)) notFound();

  const supervisors = await prisma.user.findMany({
    where: { roles: { some: { role: { name: "supervisor" } } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: SUPERVISOR_SELECT,
  });

  return (
    <AppShell user={session.user} section="supervisors" breadcrumb="Supervisores">
      <SupervisorsAdmin
        initialSupervisors={supervisors.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
      />
    </AppShell>
  );
}
