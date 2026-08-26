-- URL externa de foto para quem não é vendedor, para a tela de perfil oferecer
-- as mesmas duas opções (upload ou URL) a todo mundo.
ALTER TABLE "users" ADD COLUMN "photo_url" TEXT;
