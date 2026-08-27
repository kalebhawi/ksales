import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideProxy } from "../src/lib/route-access";

const COM_COOKIE = true;
const SEM_COOKIE = false;

describe("proxy: rotas públicas", () => {
  it("deixa passar o login e as APIs de sessão, com ou sem cookie", () => {
    // O manifesto é buscado na tela de login, antes de haver sessão.
    for (const rota of ["/login", "/manifest.webmanifest", "/api/auth/login", "/api/auth/logout"]) {
      assert.deepEqual(decideProxy(rota, SEM_COOKIE), { kind: "next" }, rota);
      assert.deepEqual(decideProxy(rota, COM_COOKIE), { kind: "next" }, rota);
    }
  });
});

describe("proxy: sem cookie", () => {
  it("manda páginas para o login guardando o destino", () => {
    assert.deepEqual(decideProxy("/fila", SEM_COOKIE), {
      kind: "redirect",
      pathname: "/login",
      next: "/fila",
    });
  });

  it("não guarda destino quando a origem é a raiz", () => {
    assert.deepEqual(decideProxy("/", SEM_COOKIE), { kind: "redirect", pathname: "/login", next: null });
  });

  it("responde 401 em API, em vez de redirecionar", () => {
    for (const rota of ["/api/sellers", "/api/metrics", "/api/admin/sellers"]) {
      assert.deepEqual(decideProxy(rota, SEM_COOKIE), { kind: "unauthorized" }, rota);
    }
  });
});

describe("proxy: cookie presente porém possivelmente inválido", () => {
  it("deixa passar para a página validar de verdade", () => {
    for (const rota of ["/", "/fila", "/perfil", "/admin/vendedores", "/api/sellers"]) {
      assert.deepEqual(decideProxy(rota, COM_COOKIE), { kind: "next" }, rota);
    }
  });

  /**
   * Regressão do ERR_TOO_MANY_REDIRECTS: com um cookie obsoleto, o proxy mandava
   * `/login` para `/`, a página não achava a sessão e devolvia para `/login`.
   * A presença do cookie não pode gerar redirecionamento — nunca.
   */
  it("nunca redireciona para fora do login por causa do cookie", () => {
    assert.deepEqual(decideProxy("/login", COM_COOKIE), { kind: "next" });
  });

  it("nenhuma rota gera redirect quando o cookie existe", () => {
    const rotas = ["/", "/login", "/fila", "/perfil", "/trocar-senha", "/admin/vendedores", "/admin/supervisores"];

    for (const rota of rotas) {
      assert.notEqual(decideProxy(rota, COM_COOKIE).kind, "redirect", rota);
    }
  });

  it("o par (rota, decisão) não fecha ciclo entre / e /login", () => {
    // Com cookie: ambos passam. Sem cookie: `/` vai para `/login`, e `/login`
    // passa — o caminho sempre termina no formulário.
    assert.equal(decideProxy("/", COM_COOKIE).kind, "next");
    assert.equal(decideProxy("/login", COM_COOKIE).kind, "next");

    const daRaiz = decideProxy("/", SEM_COOKIE);
    assert.equal(daRaiz.kind, "redirect");
    assert.equal(daRaiz.kind === "redirect" && decideProxy(daRaiz.pathname, SEM_COOKIE).kind, "next");
  });
});
