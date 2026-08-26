import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_GROUP,
  AUDIT_ACTION_LABELS,
  AUDIT_PAGE_SIZES,
  auditDateFromFileName,
  auditFileName,
  auditDetailLabel,
  auditRangeFileName,
  auditValueLabel,
  formatAuditTimestamp,
  isAuditAction,
  isAuditDate,
  isAuditPageSize,
  matchesAuditSearch,
  paginateAudit,
  parseAuditLine,
  type AuditEntry,
} from "../src/lib/audit-events";
import { formatOperationTimestamp } from "../src/lib/operation-day";

describe("auditoria: nome do arquivo", () => {
  it("usa o formato dia_mes_ano do exemplo", () => {
    assert.equal(auditFileName("2026-08-26"), "audit_log_26_08_2026.jsonl");
    assert.equal(auditFileName("2026-01-01"), "audit_log_01_01_2026.jsonl");
  });

  it("volta da data a partir do nome", () => {
    assert.equal(auditDateFromFileName("audit_log_26_08_2026.jsonl"), "2026-08-26");
  });

  it("ignora arquivo que não é do formato", () => {
    for (const name of [
      "README.md",
      "audit_log_26_08_2026.txt",
      "audit_log_2026_08_26.jsonl",
      "audit_log_31_02_2026.jsonl",
      ".gitkeep",
    ]) {
      assert.equal(auditDateFromFileName(name), null, name);
    }
  });

  it("ida e volta preserva a data", () => {
    for (const date of ["2026-08-26", "2025-12-31", "2024-02-29"]) {
      assert.equal(auditDateFromFileName(auditFileName(date)), date, date);
    }
  });

  it("nomeia o arquivo combinado de um período", () => {
    assert.equal(auditRangeFileName("2026-08-26", "2026-08-26"), "audit_log_26_08_2026.jsonl");
    assert.equal(auditRangeFileName("2026-08-01", "2026-08-15"), "audit_log_01_08_2026_a_15_08_2026.jsonl");
  });
});

describe("auditoria: validação da data", () => {
  it("aceita só data de calendário real", () => {
    assert.equal(isAuditDate("2026-08-26"), true);
    assert.equal(isAuditDate("2024-02-29"), true);
    assert.equal(isAuditDate("2026-02-29"), false);
    assert.equal(isAuditDate("2026-13-01"), false);
  });

  /**
   * O nome do arquivo nunca vem do cliente: a rota de download valida a data e
   * `auditFileName` monta o nome. Estes são os disfarces que chegariam por
   * `?dia=` se a validação afrouxasse.
   */
  it("recusa tentativa de travessia de diretório", () => {
    for (const value of [
      "../../etc/passwd",
      "2026-08-26/../../.env",
      "..%2F..%2F.env",
      "2026-08-26\\..\\.env",
      "",
      null,
      undefined,
      42,
    ]) {
      assert.equal(isAuditDate(value), false, String(value));
      assert.throws(() => auditFileName(value as string), /Data inválida/, String(value));
    }
  });
});

describe("auditoria: vocabulário", () => {
  it("toda ação tem rótulo em português", () => {
    for (const action of AUDIT_ACTIONS) {
      assert.ok(AUDIT_ACTION_LABELS[action]?.length, action);
    }
  });

  it("cobre o que a operação pediu para registrar", () => {
    for (const action of [
      "ENTERED_QUEUE",
      "STARTED_SERVICE",
      "COMPLETED_SERVICE",
      "RETURNED_TO_QUEUE",
      "REORDERED_QUEUE",
      "REMOVED_FROM_QUEUE",
      "ENDED_SHIFT",
    ]) {
      assert.equal(isAuditAction(action), true, action);
    }

    assert.equal(isAuditAction("QUALQUER_COISA"), false);
  });
});

describe("auditoria: carimbo de tempo", () => {
  const zone = "America/Sao_Paulo";

  it("grava a hora da loja com o deslocamento explícito", () => {
    const stamp = formatOperationTimestamp(new Date("2026-08-26T14:32:05.123Z"), zone);

    assert.equal(stamp, "2026-08-26T11:32:05.123-03:00");
  });

  it("mantém o instante recuperável", () => {
    const instante = new Date("2026-08-26T02:30:00.000Z");

    assert.equal(new Date(formatOperationTimestamp(instante, zone)).getTime(), instante.getTime());
  });

  it("acompanha o horário de verão de um fuso que ainda tem", () => {
    const zone = "Europe/Lisbon";

    assert.ok(formatOperationTimestamp(new Date("2026-01-15T12:00:00Z"), zone).endsWith("+00:00"));
    assert.ok(formatOperationTimestamp(new Date("2026-07-15T12:00:00Z"), zone).endsWith("+01:00"));
  });
});

describe("auditoria: leitura das linhas", () => {
  const linha = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      timestamp: "2026-08-26T11:32:05.123-03:00",
      action: "STARTED_SERVICE",
      label: "Entrada em atendimento",
      actor: { id: "u1", name: "Admin", role: "admin" },
      target: { id: "s1", name: "Beatriz Nunes" },
      details: { posicaoAnterior: 3, origem: "fila" },
      ...extra,
    });

  it("lê uma linha gravada", () => {
    const entry = parseAuditLine(linha());

    assert.equal(entry?.action, "STARTED_SERVICE");
    assert.equal(entry?.actor?.name, "Admin");
    assert.deepEqual(entry?.details, { posicaoAnterior: 3, origem: "fila" });
  });

  /** Uma linha truncada por queda de disco não pode derrubar a tela inteira. */
  it("devolve null para linha ilegível em vez de estourar", () => {
    for (const bruta of ["", "   ", "{isso não é json", "null", "[]", '{"action":"INEXISTENTE"}', '{"timestamp":1}']) {
      assert.equal(parseAuditLine(bruta), null, bruta);
    }
  });

  it("mantém o horário da loja em vez de reconverter no navegador", () => {
    assert.deepEqual(formatAuditTimestamp("2026-08-26T11:32:05.123-03:00"), { date: "26/08", time: "11:32:05" });
  });
});

describe("auditoria: busca e paginação", () => {
  const entrada = (over: Partial<AuditEntry>): AuditEntry => ({
    timestamp: "2026-08-26T11:32:05.123-03:00",
    action: "STARTED_SERVICE",
    label: "Entrada em atendimento",
    actor: { id: "u1", name: "Admin", role: "admin" },
    target: { id: "s1", name: "João Pedro" },
    store: { id: "loja-1", name: "Loja 1" },
    details: { motivo: "encerrar_dia" },
    ...over,
  });

  it("acha sem depender de acento nem de caixa", () => {
    const entry = entrada({});

    for (const termo of ["joao", "JOÃO", "  joão pedro "]) {
      assert.equal(matchesAuditSearch(entry, termo), true, termo);
    }
  });

  it("procura também no ator, no id e nos detalhes", () => {
    const entry = entrada({});

    assert.equal(matchesAuditSearch(entry, "admin"), true);
    assert.equal(matchesAuditSearch(entry, "s1"), true);
    assert.equal(matchesAuditSearch(entry, "encerrar dia"), true, "usa o rótulo legível do valor");
    assert.equal(matchesAuditSearch(entry, "atendimento"), true);
    assert.equal(matchesAuditSearch(entry, "marina"), false);
  });

  it("busca vazia não filtra nada", () => {
    assert.equal(matchesAuditSearch(entrada({}), "   "), true);
  });

  it("pagina e prende a página na faixa válida", () => {
    const itens = Array.from({ length: 57 }, (_, index) => index + 1);

    assert.deepEqual(paginateAudit(itens, 1, 25).items.slice(0, 2), [1, 2]);
    assert.equal(paginateAudit(itens, 1, 25).pages, 3);
    assert.equal(paginateAudit(itens, 3, 25).items.length, 7);

    // `?pagina=999` cai na última em vez de devolver tela vazia.
    assert.equal(paginateAudit(itens, 999, 25).page, 3);
    assert.equal(paginateAudit(itens, 0, 25).page, 1);
    assert.equal(paginateAudit([], 1, 25).pages, 1);
  });

  it("aceita só os tamanhos de página oferecidos na tela", () => {
    for (const size of AUDIT_PAGE_SIZES) assert.equal(isAuditPageSize(size), true, String(size));
    for (const size of [1, 24, 1000, "25000", null]) assert.equal(isAuditPageSize(size), false, String(size));
  });
});

describe("auditoria: rótulos da tabela", () => {
  it("traduz chave conhecida e mantém a desconhecida", () => {
    assert.equal(auditDetailLabel("posicaoAnterior"), "posição anterior");
    assert.equal(auditDetailLabel("campoNovo"), "campoNovo");
  });

  it("deixa o valor legível sem esconder o que foi gravado", () => {
    assert.equal(auditValueLabel("SALE_CONVERTED"), "venda concluída");
    assert.equal(auditValueLabel(true), "sim");
    assert.equal(auditValueLabel(false), "não");
    assert.equal(auditValueLabel(null), "—");
    assert.equal(auditValueLabel(["name", "level"]), "name, level");
    assert.equal(auditValueLabel(3), "3");
    assert.equal(auditValueLabel("cmta3srv800021su7u0dt2cgl"), "cmta3srv800021su7u0dt2cgl");
  });

  it("toda ação cai em um grupo de cor", () => {
    for (const action of AUDIT_ACTIONS) assert.ok(AUDIT_ACTION_GROUP[action], action);
  });
});
