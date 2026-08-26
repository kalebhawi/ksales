-- A operação passa a ser multi-loja: fila, atendimentos e cadastro sempre
-- pertencem a uma loja. O que já existe é uma operação só, e ela vira a Loja 1.
--
-- O id é fixo, e não gen_random_uuid(), porque as instruções abaixo o
-- referenciam e o seed precisa reconhecer a mesma loja em qualquer ambiente.
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stores_name_key" ON "stores"("name");

INSERT INTO "stores" ("id", "name", "active", "created_at", "updated_at")
VALUES ('store_loja_1', 'Loja 1', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Lojas que um supervisor enxerga. Administrador não entra aqui: vê todas.
-- Vendedor também não: a loja dele é a do próprio cadastro.
CREATE TABLE "user_stores" (
    "user_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stores_pkey" PRIMARY KEY ("user_id", "store_id")
);

CREATE INDEX "user_stores_store_id_idx" ON "user_stores"("store_id");

ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Todo supervisor já cadastrado passa a enxergar a Loja 1. Sem isto ele
-- entraria sem loja nenhuma e não veria vendedor algum depois da atualização.
INSERT INTO "user_stores" ("user_id", "store_id")
SELECT u."id", 'store_loja_1'
FROM "users" u
JOIN "user_roles" ur ON ur."user_id" = u."id"
JOIN "roles" r ON r."id" = ur."role_id"
WHERE r."name" = 'supervisor'
ON CONFLICT DO NOTHING;

-- Coluna primeiro anulável, preenchida, e só então obrigatória: um NOT NULL
-- direto quebraria em qualquer banco que já tenha vendedores.
ALTER TABLE "sellers" ADD COLUMN "store_id" TEXT;
UPDATE "sellers" SET "store_id" = 'store_loja_1' WHERE "store_id" IS NULL;
ALTER TABLE "sellers" ALTER COLUMN "store_id" SET NOT NULL;

ALTER TABLE "sellers" ADD CONSTRAINT "sellers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "sellers_queue_status_queue_position_idx";
CREATE INDEX "sellers_store_id_queue_status_queue_position_idx" ON "sellers"("store_id", "queue_status", "queue_position");

-- A loja fica gravada no atendimento, não só no vendedor: transferir alguém de
-- loja não pode reescrever o histórico já fechado.
ALTER TABLE "status_atendimento" ADD COLUMN "store_id" TEXT;
UPDATE "status_atendimento" a SET "store_id" = s."store_id" FROM "sellers" s WHERE s."id" = a."seller_id";
UPDATE "status_atendimento" SET "store_id" = 'store_loja_1' WHERE "store_id" IS NULL;
ALTER TABLE "status_atendimento" ALTER COLUMN "store_id" SET NOT NULL;

ALTER TABLE "status_atendimento" ADD CONSTRAINT "status_atendimento_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "status_atendimento_store_id_started_at_idx" ON "status_atendimento"("store_id", "started_at");
