import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversionRate, formatChange, initialsOf, relativeChange, toneOf } from "../src/lib/format";
import { operationDayRange, previousOperationDayRange, startOfOperationDay } from "../src/lib/operation-day";

describe("indicadores", () => {
  it("calcula conversão sem dividir por zero", () => {
    assert.equal(conversionRate(0, 0), 0);
    assert.equal(conversionRate(3, 12), 0.25);
  });

  it("devolve null quando não há base de comparação", () => {
    assert.equal(relativeChange(5, 0), null);
    assert.equal(relativeChange(0, 0), 0);
    assert.equal(relativeChange(12, 10), 0.2);
  });

  it("classifica a variação para exibição", () => {
    assert.deepEqual(formatChange(null), { label: "sem base", tone: "neutral" });
    assert.deepEqual(formatChange(0), { label: "estável", tone: "neutral" });
    assert.equal(formatChange(0.125).tone, "positive");
    assert.equal(formatChange(-0.125).tone, "negative");
  });

  it("gera iniciais e tom estáveis", () => {
    assert.equal(initialsOf("  maria  clara  souza "), "MC");
    assert.equal(initialsOf("Rafael"), "R");
    assert.equal(toneOf("MC-001"), toneOf("MC-001"));
  });
});

describe("dia de operação", () => {
  const zone = "America/Sao_Paulo";

  it("fecha o dia na meia-noite do fuso da loja, não do servidor", () => {
    // 26/08/2026 02:30 UTC ainda é 25/08 às 23:30 em São Paulo (UTC-3).
    const start = startOfOperationDay(new Date("2026-08-26T02:30:00Z"), zone);

    assert.equal(start.toISOString(), "2026-08-25T03:00:00.000Z");
  });

  it("cobre exatamente 24 horas", () => {
    const { from, to } = operationDayRange(new Date("2026-08-26T14:00:00Z"), zone);

    assert.equal(from.toISOString(), "2026-08-26T03:00:00.000Z");
    assert.equal(to.getTime() - from.getTime(), 24 * 60 * 60 * 1000);
  });

  it("encaixa o dia anterior imediatamente antes do atual", () => {
    const reference = new Date("2026-08-26T14:00:00Z");
    const today = operationDayRange(reference, zone);
    const yesterday = previousOperationDayRange(reference, zone);

    assert.equal(yesterday.to.getTime(), today.from.getTime());
    assert.equal(yesterday.from.toISOString(), "2026-08-25T03:00:00.000Z");
  });
});
