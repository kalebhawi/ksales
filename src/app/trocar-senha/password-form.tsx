"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/password-rules";

export function PasswordForm({ required, name }: { required: boolean; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    // No primeiro acesso não pedimos a senha provisória: o login acabou de
    // prová-la. A verificação de "diferente da atual" fica com o servidor,
    // que compara contra o hash.
    const currentPassword = required ? null : String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    // Mesmas regras do servidor, só para responder sem ida e volta.
    const check = validateNewPassword(currentPassword, newPassword, confirmation);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setPending(true);

    try {
      const response = await fetch(apiUrl("/auth/password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          required ? { newPassword, confirmation } : { currentPassword, newPassword, confirmation },
        ),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível trocar a senha.");
        setPending(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setPending(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand login-brand">
          <span className="brand-mark">k</span>
          <span>kalebhawi</span>
        </div>

        <h1>{required ? "Defina sua senha" : "Trocar senha"}</h1>
        <p className="login-subtitle">
          {required
            ? `Olá, ${name.split(" ")[0]}. Sua senha foi cadastrada pelo administrador e é provisória — escolha uma nova para continuar.`
            : "Escolha uma nova senha de acesso."}
        </p>

        {!required && (
          <>
            <label htmlFor="currentPassword">
              <KeyRound size={13} /> Senha atual
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </>
        )}

        <label htmlFor="newPassword">Nova senha</label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />

        <label htmlFor="confirmation">Confirme a nova senha</label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />

        {error && <p className="login-error">{error}</p>}

        <button className="primary-button full" type="submit" disabled={pending}>
          <KeyRound size={17} /> {pending ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
