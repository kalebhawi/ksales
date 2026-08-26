"use client";

import { useLinkStatus } from "next/link";

/**
 * Faixa de carregamento no item do menu que foi clicado.
 *
 * As telas são todas dinâmicas e sem `loading.js`, então a navegação fica
 * bloqueada esperando o servidor. Sem isto, o clique não tem resposta nenhuma
 * até a próxima tela aparecer inteira.
 */
export function NavHint() {
  const { pending } = useLinkStatus();

  return <span aria-hidden className={`nav-hint ${pending ? "is-pending" : ""}`} />;
}
