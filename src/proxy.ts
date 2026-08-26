import { NextResponse, type NextRequest } from "next/server";
import { decideProxy } from "@/lib/route-access";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Checagem otimista: aqui só olhamos a presença do cookie, para não renderizar
 * telas protegidas à toa. A validação real da sessão acontece em `@/lib/auth`,
 * dentro de cada página e route handler.
 *
 * A regra em si mora em `@/lib/route-access`, pura e coberta por teste — ela
 * explica por que a presença do cookie nunca pode gerar redirecionamento.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const decision = decideProxy(pathname, request.cookies.has(SESSION_COOKIE));

  if (decision.kind === "next") return NextResponse.next();

  if (decision.kind === "unauthorized") {
    return NextResponse.json({ error: "Sessão expirada ou inexistente." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = decision.next ? `?next=${encodeURIComponent(decision.next)}` : "";

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
