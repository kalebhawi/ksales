import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "../src/lib/password-rules";

describe("troca de senha", () => {
  it("aceita uma senha nova válida", () => {
    assert.deepEqual(validateNewPassword("provisoria1", "minha-senha-nova", "minha-senha-nova"), { ok: true });
  });

  it("exige o tamanho mínimo", () => {
    const result = validateNewPassword("provisoria1", "curta", "curta");
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", new RegExp(String(MIN_PASSWORD_LENGTH)));
  });

  it("exige que a confirmação confira", () => {
    const result = validateNewPassword("provisoria1", "minha-senha-nova", "outra-coisa-aqui");
    assert.equal(result.ok, false);
  });

  it("recusa repetir a senha atual quando ela é informada", () => {
    const result = validateNewPassword("provisoria1", "provisoria1", "provisoria1");
    assert.equal(result.ok, false);
  });

  it("no primeiro acesso não exige a senha atual", () => {
    // current = null: o login com a provisória já serviu de prova de identidade.
    assert.deepEqual(validateNewPassword(null, "minha-senha-nova", "minha-senha-nova"), { ok: true });
  });

  it("no primeiro acesso ainda cobra tamanho e confirmação", () => {
    assert.equal(validateNewPassword(null, "curta", "curta").ok, false);
    assert.equal(validateNewPassword(null, "minha-senha-nova", "outra-coisa-aqui").ok, false);
  });

  it("com current null, uma senha igual à provisória passa aqui e é barrada no servidor", () => {
    // A comparação contra o hash é responsabilidade da rota; a função pura não
    // tem o texto puro da senha atual para comparar.
    assert.deepEqual(validateNewPassword(null, "provisoria1", "provisoria1"), { ok: true });
  });

  it("valida o tamanho antes da confirmação", () => {
    // Senha curta com confirmação divergente: a mensagem deve ser a de tamanho.
    const result = validateNewPassword("x", "curta", "diferente");
    assert.equal(result.ok === false && result.error.includes("caracteres"), true);
  });
});
