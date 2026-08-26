-- Vendedor nunca fica "disponível": ou está na fila, ou em atendimento, ou
-- fora do turno. Quem estava em AVAILABLE passa a estar fora do turno.
UPDATE "sellers" SET "queue_status" = 'OFF_SHIFT' WHERE "queue_status" = 'AVAILABLE';

-- Postgres não deixa remover valor de enum: o tipo é recriado sem AVAILABLE.
ALTER TABLE "sellers" ALTER COLUMN "queue_status" DROP DEFAULT;

CREATE TYPE "SellerQueueStatus_new" AS ENUM ('QUEUED', 'IN_SERVICE', 'OFF_SHIFT');

ALTER TABLE "sellers"
  ALTER COLUMN "queue_status" TYPE "SellerQueueStatus_new"
  USING ("queue_status"::text::"SellerQueueStatus_new");

DROP TYPE "SellerQueueStatus";
ALTER TYPE "SellerQueueStatus_new" RENAME TO "SellerQueueStatus";

ALTER TABLE "sellers" ALTER COLUMN "queue_status" SET DEFAULT 'OFF_SHIFT';
