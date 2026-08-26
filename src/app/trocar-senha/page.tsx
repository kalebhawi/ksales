import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trocar senha · ksales" };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <PasswordForm required={user.mustChangePassword} name={user.name} />;
}
