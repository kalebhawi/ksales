/**
 * O manifesto entra aqui porque o navegador o busca já na tela de login, antes
 * de existir sessão: atrás do proxy ele voltava como redirecionamento e o
 * atalho da tela inicial não carregava. Não há nada sigiloso nele — nome da
 * aplicação, cores e ícones.
 */
export const PUBLIC_PAGES = ["/login", "/manifest.webmanifest"];
export const PUBLIC_APIS = ["/api/auth/login", "/api/auth/logout"];

export type ProxyDecision =
  | { kind: "next" }
  | { kind: "unauthorized" }
  | { kind: "redirect"; pathname: string; next: string | null };

/**
 * Decisão do proxy. `hasSession` é apenas "existe um cookie", nunca "a sessão
 * vale" — quem valida é `@/lib/auth`, dentro da página ou do route handler.
 *
 * Por isso a regra é assimétrica de propósito: a ausência de cookie pode barrar
 * o acesso, mas a presença NUNCA pode redirecionar para fora de uma rota
 * pública. Um cookie que existe e não vale mais (sessão revogada, expirada,
 * banco recriado) faria `/login` apontar para `/`, a página não acharia a
 * sessão e devolveria para `/login` — ERR_TOO_MANY_REDIRECTS. Tirar de `/login`
 * quem já está autenticado é responsabilidade da página, que checa de verdade.
 */
export function decideProxy(pathname: string, hasSession: boolean): ProxyDecision {
  if (PUBLIC_APIS.includes(pathname) || PUBLIC_PAGES.includes(pathname)) {
    return { kind: "next" };
  }

  if (hasSession) return { kind: "next" };

  if (pathname.startsWith("/api/")) return { kind: "unauthorized" };

  return { kind: "redirect", pathname: "/login", next: pathname === "/" ? null : pathname };
}
