-- Perfil de quem não entra na fila (administrador, supervisor): a foto e a
-- descrição do vendedor moram em `sellers`, e quem não tem cadastro de vendedor
-- não tinha onde guardar as suas.
ALTER TABLE "users" ADD COLUMN "description" TEXT;

-- Tabela separada pelo mesmo motivo de `seller_photos`: `users` é lido em toda
-- requisição para montar a sessão, e um BYTEA ali viria junto.
CREATE TABLE "user_photos" (
    "user_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_photos_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
