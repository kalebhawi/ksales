"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, KeyRound, LogOut, UserCircle } from "lucide-react";
import { apiUrl } from "@/lib/base-path";

/**
 * Menu da conta no topo. Era um avatar decorativo, sem ação nenhuma — e é o
 * lugar onde todo mundo procura o próprio perfil.
 */
export function AccountMenu({
  name,
  initials,
  role,
  photo,
}: {
  name: string;
  initials: string;
  role: string;
  photo: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();

    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setPending(true);
    await fetch(apiUrl("/auth/logout"), { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="account-menu" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="top-profile"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Sua conta"
        onClick={() => setOpen((value) => !value)}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="mini-avatar photo" src={photo} alt="" />
        ) : (
          <span className="mini-avatar blue">{initials}</span>
        )}
        <ChevronDown size={15} />
      </button>

      {open && (
        <div className="context-menu account-dropdown" role="menu">
          <p className="context-menu-title">
            {name}
            <span>{role}</span>
          </p>
          <Link href="/perfil" onClick={() => setOpen(false)}>
            <UserCircle size={15} /> Meu perfil
          </Link>
          <Link href="/trocar-senha" onClick={() => setOpen(false)}>
            <KeyRound size={15} /> Alterar senha
          </Link>
          <button type="button" disabled={pending} onClick={logout}>
            <LogOut size={15} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}
