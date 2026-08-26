import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operationDateParts, startOfOperationDayFor } from "../src/lib/operation-day";
import { canonicalPeriod, parsePeriod, periodLabel, periodQuery, resolvePeriod } from "../src/lib/period";

const ZONE = "America/Sao_Paulo";
// Quarta-feira, 26/08/2026, 11h em São Paulo.
const AGORA = new Date("2026-08-26T14:00:00Z");

describe("período: leitura da query", () => {
  it("sem parâmetro é hoje", () => {
    assert.deepEqual(parsePeriod({}), { spec: { kind: "hoje" }, error: null });
  });

  it("aceita os atalhos", () => {
    for (const kind of ["hoje", "ontem", "mes-atual", "mes-passado"]) {
      assert.deepEqual(parsePeriod({ periodo: kind }), { spec: { kind }, error: null }, kind);
    }
  });

  it("lê dia, intervalo e mês", () => {
    assert.deepEqual(parsePeriod({ periodo: "dia", de: "2026-08-14" }).spec, { kind: "dia", date: "2026-08-14" });
    assert.deepEqual(parsePeriod({ periodo: "intervalo", de: "2026-08-01", ate: "2026-08-15" }).spec, {
      kind: "intervalo",
      from: "2026-08-01",
      to: "2026-08-15",
    });
    assert.deepEqual(parsePeriod({ periodo: "mes", mes: "2025-03" }).spec, { kind: "mes", year: 2025, month: 3 });
  });

  it("desinverte o intervalo em vez de recusar", () => {
    assert.deepEqual(parsePeriod({ periodo: "intervalo", de: "2026-08-15", ate: "2026-08-01" }).spec, {
      kind: "intervalo",
      from: "2026-08-01",
      to: "2026-08-15",
    });
  });

  it("recusa data que não existe no calendário", () => {
    // Sem isso, 30/02 viraria 02/03 calado e a tela mostraria outro dia.
    for (const de of ["2026-02-30", "2026-13-01", "26-08-2026", "1999-08-01", "abc"]) {
      const parsed = parsePeriod({ periodo: "dia", de });
      assert.deepEqual(parsed.spec, { kind: "hoje" }, de);
      assert.ok(parsed.error, de);
    }
  });

  it("avisa quando falta uma das pontas do intervalo", () => {
    assert.ok(parsePeriod({ periodo: "intervalo", de: "2026-08-01" }).error);
    assert.ok(parsePeriod({ periodo: "mes", mes: "2026-15" }).error);
    assert.ok(parsePeriod({ periodo: "trimestre" }).error);
  });

  it("ida e volta pela query string preserva o período", () => {
    const specs = [
      { kind: "hoje" },
      { kind: "ontem" },
      { kind: "mes-atual" },
      { kind: "mes-passado" },
      { kind: "dia", date: "2026-08-14" },
      { kind: "intervalo", from: "2026-08-01", to: "2026-08-15" },
      { kind: "mes", year: 2025, month: 3 },
    ] as const;

    for (const spec of specs) {
      const query = Object.fromEntries(new URLSearchParams(periodQuery(spec)));
      assert.deepEqual(parsePeriod(query).spec, spec, JSON.stringify(spec));
    }
  });
});

describe("período: intervalo consultado", () => {
  it("hoje cobre o dia de operação corrente", () => {
    const { range } = resolvePeriod({ kind: "hoje" }, AGORA, ZONE);

    assert.equal(range.from.toISOString(), "2026-08-26T03:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-27T03:00:00.000Z");
  });

  it("ontem termina exatamente onde hoje começa", () => {
    const hoje = resolvePeriod({ kind: "hoje" }, AGORA, ZONE);
    const ontem = resolvePeriod({ kind: "ontem" }, AGORA, ZONE);

    assert.equal(ontem.range.to.getTime(), hoje.range.from.getTime());
    assert.equal(ontem.range.from.toISOString(), "2026-08-25T03:00:00.000Z");
  });

  it("intervalo inclui o último dia inteiro", () => {
    const { range } = resolvePeriod({ kind: "intervalo", from: "2026-08-01", to: "2026-08-15" }, AGORA, ZONE);

    assert.equal(range.from.toISOString(), "2026-08-01T03:00:00.000Z");
    // 16/08 às 00h, e não 15/08 às 00h: quem atendeu dia 15 tem que entrar.
    assert.equal(range.to.toISOString(), "2026-08-16T03:00:00.000Z");
  });

  it("mês vai do dia 1 ao dia 1 do mês seguinte", () => {
    const { range } = resolvePeriod({ kind: "mes", year: 2026, month: 2 }, AGORA, ZONE);

    assert.equal(range.from.toISOString(), "2026-02-01T03:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-03-01T03:00:00.000Z");
  });

  it("vira o ano no mês passado de janeiro", () => {
    const janeiro = new Date("2026-01-10T14:00:00Z");

    assert.deepEqual(canonicalPeriod({ kind: "mes-passado" }, janeiro, ZONE), { kind: "mes", year: 2025, month: 12 });
  });

  it("respeita o horário de verão do fuso da loja", () => {
    // São Paulo não tem mais horário de verão, então o teste usa um fuso que tem:
    // sem a correção, a meia-noite local sairia deslocada em uma hora.
    const zone = "Europe/Lisbon";
    const inverno = startOfOperationDayFor(2026, 1, 15, zone);
    const verao = startOfOperationDayFor(2026, 7, 15, zone);

    assert.equal(inverno.toISOString(), "2026-01-15T00:00:00.000Z");
    assert.equal(verao.toISOString(), "2026-07-14T23:00:00.000Z");
  });
});

describe("período: base de comparação", () => {
  it("um dia compara com o dia anterior", () => {
    const { previous, range, comparison } = resolvePeriod({ kind: "dia", date: "2026-08-14" }, AGORA, ZONE);

    assert.equal(previous.to.getTime(), range.from.getTime());
    assert.equal(previous.from.toISOString(), "2026-08-13T03:00:00.000Z");
    assert.equal(comparison, "vs. dia anterior");
  });

  it("intervalo de N dias compara com os N dias imediatamente anteriores", () => {
    const { previous, range, comparison } = resolvePeriod(
      { kind: "intervalo", from: "2026-08-11", to: "2026-08-15" },
      AGORA,
      ZONE,
    );

    assert.equal(previous.to.getTime(), range.from.getTime());
    assert.equal(previous.from.toISOString(), "2026-08-06T03:00:00.000Z");
    assert.equal(comparison, "vs. 5 dias anteriores");
  });

  it("mês fechado compara com o mês anterior inteiro", () => {
    const { previous, comparison, inProgress } = resolvePeriod({ kind: "mes", year: 2026, month: 7 }, AGORA, ZONE);

    assert.equal(previous.from.toISOString(), "2026-06-01T03:00:00.000Z");
    assert.equal(previous.to.toISOString(), "2026-07-01T03:00:00.000Z");
    assert.equal(comparison, "vs. mês anterior");
    assert.equal(inProgress, false);
  });

  it("mês em curso compara com o mesmo número de dias do mês anterior", () => {
    // Estamos em 26/08: comparar 26 dias contra os 31 de julho fingiria uma queda.
    const { previous, comparison, inProgress } = resolvePeriod({ kind: "mes-atual" }, AGORA, ZONE);

    assert.equal(previous.from.toISOString(), "2026-07-01T03:00:00.000Z");
    assert.equal(previous.to.toISOString(), "2026-07-27T03:00:00.000Z");
    assert.equal(comparison, "vs. mesmo trecho do mês anterior");
    assert.equal(inProgress, true);
  });

  it("não estoura o mês anterior quando ele é mais curto", () => {
    // 30/03 tem 30 dias vividos, mas fevereiro de 2026 só tem 28.
    const trintaDeMarco = new Date("2026-03-30T14:00:00Z");
    const { previous } = resolvePeriod({ kind: "mes-atual" }, trintaDeMarco, ZONE);

    assert.equal(previous.from.toISOString(), "2026-02-01T03:00:00.000Z");
    assert.equal(previous.to.toISOString(), "2026-03-01T03:00:00.000Z");
  });

  it("o mês corrente escolhido pelo seletor também é tratado como em curso", () => {
    const escolhido = resolvePeriod({ kind: "mes", year: 2026, month: 8 }, AGORA, ZONE);
    const atalho = resolvePeriod({ kind: "mes-atual" }, AGORA, ZONE);

    assert.equal(escolhido.previous.to.getTime(), atalho.previous.to.getTime());
    assert.equal(escolhido.inProgress, true);
  });
});

describe("período: rótulos", () => {
  it("nomeia cada escolha", () => {
    assert.equal(periodLabel({ kind: "hoje" }, AGORA, ZONE), "Hoje");
    assert.equal(periodLabel({ kind: "ontem" }, AGORA, ZONE), "Ontem");
    assert.equal(periodLabel({ kind: "dia", date: "2026-08-14" }, AGORA, ZONE), "14/08/2026");
    assert.equal(
      periodLabel({ kind: "intervalo", from: "2026-08-01", to: "2026-08-15" }, AGORA, ZONE),
      "01/08/2026 até 15/08/2026",
    );
    assert.equal(periodLabel({ kind: "mes-atual" }, AGORA, ZONE), "agosto de 2026");
    assert.equal(periodLabel({ kind: "mes-passado" }, AGORA, ZONE), "julho de 2026");
    assert.equal(periodLabel({ kind: "mes", year: 2025, month: 3 }, AGORA, ZONE), "março de 2025");
  });

  it("a data de referência é lida no fuso da loja", () => {
    // 01/09 às 01h UTC ainda é 31/08 em São Paulo: o mês atual é agosto.
    const viradaDeMes = new Date("2026-09-01T01:00:00Z");

    assert.equal(operationDateParts(viradaDeMes, ZONE).month, 8);
    assert.equal(periodLabel({ kind: "mes-atual" }, viradaDeMes, ZONE), "agosto de 2026");
  });
});
