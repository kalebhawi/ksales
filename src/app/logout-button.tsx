"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiUrl } from "@/lib/base-path";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch(apiUrl("/auth/logout"), { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="logout-button" onClick={logout} disabled={pending} aria-label="Sair">
      <LogOut size={17} />
    </button>
  );
}
