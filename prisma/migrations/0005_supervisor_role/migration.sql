-- O papel do vendedor passa a se chamar "seller"; "user" era ambíguo agora que
-- existe também "supervisor". Renomear preserva os vínculos em user_roles.
UPDATE "roles" SET "name" = 'seller', "description" = 'Acesso à própria operação.' WHERE "name" = 'user';

-- Papel intermediário: enxerga a visão geral, comanda a fila inteira e cadastra
-- vendedores, mas não cria outros supervisores.
INSERT INTO "roles" ("id", "name", "description", "created_at")
VALUES (gen_random_uuid()::text, 'supervisor', 'Supervisiona a fila e cadastra vendedores.', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
