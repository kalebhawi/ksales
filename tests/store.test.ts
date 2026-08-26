import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_STORE_NAME,
  pickActiveStore,
  sortStores,
  storeCountLabel,
  validateStoreName,
} from "../src/lib/store-rules";

const loja1 = { id: "s1", name: "Loja 1", active: true };
const loja2 = { id: "s2", name: "Loja 2", active: true };

describe("nome da loja", () => {
  it("apara espaços e aceita nome comum", () => {
    assert.deepEqual(validateStoreName("  Shopping Norte "), { ok: true, value: "Shopping Norte" });
  });

  it("recusa vazio e só espaços", () => {
    for (const entrada of ["", "   ", null, undefined, 42]) {
      assert.equal(validateStoreName(entrada).ok, false, String(entrada));
    }
  });

  it("recusa nome acima do limite", () => {
    assert.equal(validateStoreName("a".repeat(MAX_STORE_NAME)).ok, true);
    assert.equal(validateStoreName("a".repeat(MAX_STORE_NAME + 1)).ok, false);
  });
});

describe("loja ativa", () => {
  it("respeita a escolha quando ela está entre as permitidas", () => {
    assert.equal(pickActiveStore([loja1, loja2], "s2")?.id, "s2");
  });

  /** É a regra que impede um cookie forjado de abrir a loja de outra pessoa. */
  it("ignora escolha fora da lista e cai na primeira permitida", () => {
    assert.equal(pickActiveStore([loja1, loja2], "s9")?.id, "s1");
    assert.equal(pickActiveStore([loja2], "s1")?.id, "s2");
  });

  it("sem cookie, abre a primeira", () => {
    assert.equal(pickActiveStore([loja1, loja2], null)?.id, "s1");
    assert.equal(pickActiveStore([loja1, loja2], undefined)?.id, "s1");
  });

  it("sem loja permitida, não escolhe nenhuma", () => {
    assert.equal(pickActiveStore([], "s1"), null);
  });
});

describe("apresentação", () => {
  it("ordena por nome em português", () => {
    const ordenadas = sortStores([{ name: "Órion" }, { name: "Alfa" }, { name: "beta" }]);

    assert.deepEqual(ordenadas.map((store) => store.name), ["Alfa", "beta", "Órion"]);
  });

  it("não altera o array recebido", () => {
    const original = [{ name: "B" }, { name: "A" }];
    sortStores(original);

    assert.deepEqual(original.map((store) => store.name), ["B", "A"]);
  });

  it("conta lojas com plural certo", () => {
    assert.equal(storeCountLabel(0), "Nenhuma loja");
    assert.equal(storeCountLabel(1), "1 loja");
    assert.equal(storeCountLabel(3), "3 lojas");
  });
});
