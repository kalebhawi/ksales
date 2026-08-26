import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planQueueTransition, reorderQueue } from "../src/lib/queue";

describe("planQueueTransition", () => {
  it("coloca na fila quem está fora do turno", () => {
    // Único caminho de entrada agora: não existe mais estado "disponível".
    const result = planQueueTransition("OFF_SHIFT", "enqueue");

    assert.deepEqual(result, { ok: true, transition: { status: "QUEUED", action: "ENTERED_QUEUE" } });
  });

  it("recusa reentrada de quem já está na fila", () => {
    assert.equal(planQueueTransition("QUEUED", "enqueue").ok, false);
  });

  it("recusa voltar para a fila durante um atendimento", () => {
    assert.equal(planQueueTransition("IN_SERVICE", "enqueue").ok, false);
  });

  it("inicia atendimento apenas a partir da fila", () => {
    assert.deepEqual(planQueueTransition("QUEUED", "start"), {
      ok: true,
      transition: { status: "IN_SERVICE", action: "STARTED_SERVICE" },
    });
    assert.equal(planQueueTransition("OFF_SHIFT", "start").ok, false);
    assert.equal(planQueueTransition("IN_SERVICE", "start").ok, false);
  });

  it("exige motivo para sair da fila", () => {
    assert.equal(planQueueTransition("QUEUED", "remove").ok, false);
    assert.equal(planQueueTransition("QUEUED", "remove", { reason: "almoço" }).ok, false);
  });

  it("exige descrição quando o motivo é outro", () => {
    assert.equal(planQueueTransition("QUEUED", "remove", { reason: "outro" }).ok, false);
    assert.equal(planQueueTransition("QUEUED", "remove", { reason: "outro", notes: "   " }).ok, false);

    assert.deepEqual(planQueueTransition("QUEUED", "remove", { reason: "outro", notes: " treinamento " }), {
      ok: true,
      transition: {
        status: "OFF_SHIFT",
        action: "REMOVED_FROM_QUEUE",
        reason: "outro",
        notes: "treinamento",
      },
    });
  });

  it("marca fim de turno quando o motivo é encerrar o dia", () => {
    assert.deepEqual(planQueueTransition("QUEUED", "remove", { reason: "encerrar_dia" }), {
      ok: true,
      transition: { status: "OFF_SHIFT", action: "ENDED_SHIFT", reason: "encerrar_dia", notes: undefined },
    });
  });

  it("mantém motivos temporários como saída da fila", () => {
    for (const reason of ["intervalo", "banheiro"] as const) {
      const result = planQueueTransition("QUEUED", "remove", { reason });
      assert.equal(result.ok && result.transition.action, "REMOVED_FROM_QUEUE");
    }
  });

  it("não deixa sair da fila durante um atendimento", () => {
    assert.equal(planQueueTransition("IN_SERVICE", "remove", { reason: "intervalo" }).ok, false);
  });

  it("não remove quem já está fora do turno", () => {
    assert.equal(planQueueTransition("OFF_SHIFT", "remove", { reason: "intervalo" }).ok, false);
  });
});

describe("reorderQueue", () => {
  const queue = ["a", "b", "c", "d"];
  const ids = (result: ReturnType<typeof reorderQueue>) => (result ?? []).map((entry) => entry.id);

  it("move um vendedor para o topo e renumera de 1 a n", () => {
    assert.deepEqual(reorderQueue(queue, "c", 0), [
      { id: "c", queuePosition: 1 },
      { id: "a", queuePosition: 2 },
      { id: "b", queuePosition: 3 },
      { id: "d", queuePosition: 4 },
    ]);
  });

  it("limita a posição de destino ao tamanho da fila", () => {
    assert.deepEqual(ids(reorderQueue(queue, "a", 99)), ["b", "c", "d", "a"]);
    assert.deepEqual(ids(reorderQueue(queue, "d", -5)), ["d", "a", "b", "c"]);
  });

  it("devolve null quando o vendedor não está na fila", () => {
    assert.equal(reorderQueue(queue, "z", 0), null);
  });
});
