import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadProfile } from "@/lib/profile";
import { AppShell } from "@/app/shell";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Meu perfil · ksales" };

/**
 * Vale para todo mundo. Quem é vendedor edita a foto e a descrição do cadastro
 * — as que aparecem na fila; quem não é edita as da própria conta.
 */
export default async function ProfilePage() {
  const session = await getActor();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");

  return (
    <AppShell user={session.user} section="profile" breadcrumb="Meu perfil">
      <ProfileForm profile={await loadProfile(session.user)} />
    </AppShell>
  );
}
