import type { Check } from "@/lib/seller-rules";

/**
 * Regras de loja. Módulo puro: não toca banco nem cookie, então a tela, as
 * rotas e os testes importam à vontade. Quem lê o banco é `@/lib/stores`.
 */
export type StoreOption = {
  id: string;
  name: string;
  active: boolean;
};

/**
 * Loja que o usuário está olhando. Fica em cookie próprio, e não na sessão,
 * porque é preferência de visualização: trocar de loja não pode obrigar a
 * recriar a sessão, e o valor é sempre reconferido contra o que a pessoa
 * realmente pode ver.
 */
export const STORE_COOKIE = "ksales_loja";

export const MAX_STORE_NAME = 60;

export function validateStoreName(input: unknown): Check<string> {
  const name = typeof input === "string" ? input.trim() : "";

  if (name.length === 0) return { ok: false, error: "Nome da loja é obrigatório." };
  if (name.length > MAX_STORE_NAME) {
    return { ok: false, error: `Nome da loja pode ter no máximo ${MAX_STORE_NAME} caracteres.` };
  }

  return { ok: true, value: name };
}

/** Ordem estável em toda tela: por nome, do jeito que se lê em português. */
export function sortStores<T extends { name: string }>(stores: T[]): T[] {
  return [...stores].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Loja ativa a partir do que veio no cookie.
 *
 * O pedido só vale se estiver na lista permitida — é ela que decide, não o
 * cookie. Assim um supervisor que perdeu o vínculo com uma loja (ou um cookie
 * forjado à mão) cai na primeira loja permitida em vez de continuar vendo dados
 * que não são mais dele.
 */
export function pickActiveStore<T extends { id: string }>(allowed: T[], requested: string | null | undefined): T | null {
  if (allowed.length === 0) return null;

  return allowed.find((store) => store.id === requested) ?? allowed[0];
}

