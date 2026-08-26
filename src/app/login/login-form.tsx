"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { apiUrl } from "@/lib/base-path";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível entrar.");
        setPending(false);
        return;
      }

      const session = await response.json().catch(() => ({}));

      router.replace(session.mustChangePassword ? "/trocar-senha" : next);
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
        <h1>Entrar na operação</h1>
        <p className="login-subtitle">Use o e-mail cadastrado para acessar a fila de vendedores.</p>

        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />

        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />

        {error && <p className="login-error">{error}</p>}

        <button className="primary-button full" type="submit" disabled={pending}>
          <LogIn size={17} /> {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
