# Prompt de continuidade do projeto ksales

Você é um agente de desenvolvimento trabalhando no projeto `ksales`, localizado em `c:\Users\Usuario\Documents\Workspace\ksales`.

## Contexto do produto

Estamos criando uma aplicação web para operação comercial da Kalebhawi. A aplicação será publicada em:

- Domínio: `kalebhawi.com.br`
- Caminho da aplicação: `/sales`
- VPS: `vps70412.publiccloud.com.br`
- IP: `177.153.35.156`
- Sistema da VPS: Ubuntu 24.04

O produto precisa ter:

- Dashboard com vendedores, atendimentos e vendas convertidas.
- Tela de fila de vendedores com duas colunas: `Fila` e `Em atendimento`.
- Lista de vendedores disponíveis abaixo das colunas.
- Drag and drop de vendedores para a fila.
- Clique em vendedor na fila para iniciar atendimento.
- Menu de ações por botão direito no desktop e toque longo no celular.
- Remoção da fila com motivo obrigatório: `encerrar dia`, `intervalo`, `banheiro` ou `outro`.
- Ações durante atendimento: `venda concluída`, `venda não convertida`, `troca` e `outro`.
- Perfil de vendedor com nome, foto, descrição e estatísticas.
- Perfis de acesso: administrador e vendedor, com suporte a outros papéis no futuro.
- Vendedor pode alterar sua própria posição; administrador pode movimentar todos.

## Stack atual

- Next.js `16.3.3` (o middleware agora se chama `proxy.ts` e roda no runtime Node)
- React `19`
- TypeScript
- App Router com `src/`
- Tailwind CSS v4
- `lucide-react`
- Prisma `7.10.0`
- PostgreSQL 16
- Prisma adapter `@prisma/adapter-pg`
- `pg`
- `tsx` para seed e testes

O projeto usa `basePath: "/sales"` em `next.config.ts`. A aplicação local roda em `http://localhost:3000/sales` e as APIs são chamadas com o prefixo `/sales` no navegador (use `apiUrl()` de `src/lib/base-path.ts`, não strings soltas).

## Arquivos importantes

### Páginas

- `src/app/page.tsx` + `dashboard.tsx`: visão geral (tela de supervisão, sem interação).
- `src/app/fila/page.tsx` + `fila/queue-board.tsx`: fila — menu separado da visão geral.
- `src/app/perfil/page.tsx` + `profile-form.tsx`: vendedor edita a própria foto e descrição.
- `src/app/admin/supervisores/`: cadastro de supervisores (somente admin).
- `src/app/shell.tsx` e `src/app/logout-button.tsx`: layout lateral, topo e logout.
- `src/app/login/page.tsx` e `src/app/login/login-form.tsx`: tela de acesso.
- `src/app/trocar-senha/page.tsx` e `password-form.tsx`: troca obrigatória da senha provisória.
- `src/app/admin/vendedores/page.tsx` e `sellers-admin.tsx`: cadastro de vendedores (somente admin).
- `src/app/globals.css`: layout e responsividade.
- `src/proxy.ts`: checagem otimista do cookie e redirecionamento para `/login`.

### APIs

- `src/app/api/auth/login|logout|me/route.ts`
- `src/app/api/auth/password/route.ts`: troca de senha; única rota autenticada liberada com senha provisória.
- `src/app/api/sellers/route.ts`: GET da fila e PATCH das operações por vendedor (`enqueue`, `start`, `remove`, `reorder`) e da fila inteira (`start_next`, `end_shift_all`, só para supervisão).
- `src/app/api/atendimentos/route.ts`: conclusão do atendimento; devolve o vendedor ao fim da fila.
- `src/app/api/metrics/route.ts`: indicadores do dia (403 para vendedor).
- `src/app/api/sellers/[id]/photo/route.ts`: entrega a foto do banco, com ETag.
- `src/app/api/admin/sellers/[id]/photo/route.ts`: upload e remoção pela supervisão.
- `src/app/api/perfil/route.ts` e `perfil/photo/route.ts`: edição do próprio perfil.
- `src/app/api/admin/supervisores/route.ts` e `[id]/route.ts`: cadastro de supervisores.
- `src/app/api/admin/sellers/route.ts` e `[id]/route.ts`: cadastro, edição, desativação e reativação.

### Bibliotecas

- `src/lib/prisma.ts`: singleton do Prisma Client.
- `src/lib/password.ts`: hash e verificação com `scrypt`. **Nunca importar em Client Component** (usa `node:crypto`).
- `src/lib/password-rules.ts`: regras puras da troca de senha, seguras para o cliente.
- `src/lib/session.ts` + `src/lib/session-cookie.ts`: sessão em banco e cookie `ksales_session`.
- `src/lib/auth.ts`: fonte única da sessão no servidor (`getSessionUser`, `getActor`).
- `src/lib/authz.ts`: regras puras de permissão e hierarquia admin > supervisor > vendedor.
- `src/lib/seller-rules.ts`: regras puras de nome, nível 1–5, URL e validação de imagem por magic bytes.
- `src/lib/queue.ts`: regras puras de transição da fila e reordenação.
- `src/lib/operation-day.ts`: recorte do dia no fuso da loja e meia-noite de uma data de calendário (`startOfOperationDayFor`).
- `src/lib/period.ts`: regras puras do filtro de período da visão geral (leitura da query, intervalo consultado, base de comparação e rótulos).
- `src/lib/audit-events.ts`: vocabulário e nome de arquivo da auditoria (puro, seguro no cliente).
- `src/lib/audit-log.ts`: gravação e leitura dos arquivos da trilha. **Usa `node:fs`, nunca importar em Client Component.**
- `src/lib/format.ts`: conversão, variação, iniciais e tons (puro, usado no cliente).
- `src/lib/stats.ts` e `src/lib/dashboard-data.ts`: agregações e carga da dashboard.
- `src/lib/seller-view.ts`: serialização do vendedor para a UI.
- `src/lib/http.ts` e `src/lib/rate-limit.ts`: respostas padrão e limite de tentativas de login.

### Infra e dados

- `prisma/schema.prisma`, `prisma/migrations/0001_initial_operations`, `prisma/migrations/0002_sessions_and_seller_status`, `prisma/migrations/0003_must_change_password`.
- `prisma/seed.ts`: papéis, vendedores de exemplo e administrador com senha em hash.
- `docker-compose.yml`, `.env.example`, `README.md`.
- `DEPLOY.md`: guia de publicação na VPS, passo a passo, com `root@vps70412.publiccloud.com.br`.
- `deploy/ecosystem.config.js` (PM2), `deploy/nginx/kalebhawi.conf`, `deploy/env.production.example`, `deploy/update.sh`.
- `tests/queue.test.ts`, `tests/authz.test.ts`, `tests/metrics.test.ts`, `tests/password.test.ts`.

## Modelagem atual

### Autenticação e papéis

- `User`: email, hash de senha, nome, ativo, `mustChangePassword`, timestamps.
- `Role`: `admin`, `supervisor` e `seller`.
- `UserRole`: relação N:N entre usuários e papéis.
- `Session`: hash SHA-256 do token, usuário, expiração, último uso.

### Vendedores

- `Seller`: id `cuid()`, usuário opcional, nome obrigatório, crachá único, nível de 1 a 5, `photoUrl`, descrição, status da fila, posição, `active` e timestamps.
- `SellerPhoto` (tabela `seller_photos`): imagem em `BYTEA`, 1:1 com o vendedor. Separada de `sellers` porque a fila é lida em lista e o blob entraria em toda consulta sem `select`.
- Status da fila: `AVAILABLE`, `QUEUED`, `IN_SERVICE`, `OFF_SHIFT`.

### Atendimentos

- Model Prisma `Atendimento`, tabela SQL `status_atendimento`.
- Possui vendedor, status, ação, início, conclusão, usuário que iniciou/concluiu, observações, JSON de metadados e timestamps.
- Status: `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Ações: `SALE_CONVERTED`, `SALE_NOT_CONVERTED`, `EXCHANGE`, `OTHER`.
- Um atendimento iniciado é atualizado quando a ação manual é executada; não se cria outro atendimento para concluir o mesmo ciclo.

### Histórico da fila

- `QueueEvent`: vendedor, ação, motivo, observação, usuário responsável e timestamp.
- Registra entrada, início, remoção, retorno e encerramento de turno.

## Progresso já realizado

- Fluxo validado ponta a ponta contra PostgreSQL real (login, fila, atendimento, permissões, troca de senha).
- Dashboard visual, layout desktop e mobile. No celular Fila/Em atendimento e Disponíveis/Fora do turno ficam lado a lado, com uma busca só para as duas listas de baixo.
- Prisma, migrations e Prisma Client com adapter PostgreSQL.
- Autenticação real: senha com `scrypt`, sessão em banco, cookie httpOnly, `proxy.ts` e tela `/login`.
- Autorização no servidor em toda mutation: admin movimenta todos, vendedor movimenta só a si mesmo.
- Saída da fila com motivo obrigatório, incluindo texto livre quando o motivo é `outro`.
- Menu de ações por botão direito e por toque longo, com supressão do clique após o toque longo.
- Reordenação da fila por drag and drop, com renumeração das posições.
- Menu da coluna Fila (só supervisão): "Chamar o próximo" e "Encerrar o dia de todos", ambos em transação única. A coluna Em atendimento não tem menu — não há ação em lote que faça sentido lá.
- Três estados apenas: fila, atendimento e fora do turno. "Disponível" foi removido do enum na migration `0006_remove_available_status`; cadastro novo nasce fora do turno.
- Arrastar entre colunas: mudar de posição na fila (com confirmação), levar da fila para atendimento de qualquer posição (com confirmação quando não é o primeiro) e trazer de fora do turno para a fila.
- Arraste no celular: alça própria com `touch-action: none` e listener `touchmove` não passivo, porque arraste HTML5 não existe em toque. O toque longo continua abrindo o menu.
- Trilha de auditoria em arquivo, um por dia de operação, em JSON Lines (`audit-logs/audit_log_26_08_2026.jsonl`). Grava depois do commit e nunca derruba a resposta. Tela de download só para admin, com filtro por data e proteção contra travessia de diretório.
- Tela de auditoria com tabela paginada dos registros (horário, ação, ator, alvo, detalhes), busca livre sem acento, filtro por ação e por data. Filtro e paginação no servidor; sem filtro de data mostra o dia mais recente.
- Indicadores reais (vendas, conversão, atendimentos) por dia de operação no fuso da loja. Nenhum valor mockado na dashboard.
- Filtro de período na visão geral: hoje, ontem, dia, intervalo, mês atual, mês passado e mês/ano. Cada período tem URL própria (`?periodo=...`), lida do mesmo jeito pela página e por `/api/metrics`. A base de comparação acompanha o período, e mês em curso compara com o mesmo trecho do mês anterior.
- Cadastro administrativo de vendedores: criar, editar, desativar e reativar, com criação opcional de usuário de acesso.
- Três papéis com hierarquia: admin > supervisor > vendedor. Visão geral e fila são menus separados; vendedor não vê a visão geral (nem a página, nem `/api/metrics`).
- Admin cria supervisor e vendedor; supervisor cria vendedor; ninguém cria do próprio nível ou acima.
- Vendedor edita o próprio perfil (foto e descrição). Nome, crachá e nível ficam com a supervisão.
- Menu da conta no avatar do topo (Meu perfil, Alterar senha, Sair). `/perfil` vale para todo mundo.
- Perfil edita foto e descrição, e só. Nome e e-mail são leitura para todos. Vendedor usa foto/descrição do cadastro (`seller_photos`); quem não é vendedor usa as da conta (`user_photos`, migrations `0007`/`0008`). `src/lib/profile.ts` unifica as duas origens.
- Favicon próprio em `src/app/icon.svg` (o "k" da marca); o `favicon.ico` padrão do create-next-app foi removido.
- Foto por URL ou upload, guardada em `seller_photos` no banco, servida com ETag. Até 2 MB, só PNG/JPEG/WebP/GIF, validada por magic bytes (SVG recusado por ser XML e poder carregar script).
- Senha provisória: só o admin cadastra vendedor e define a senha inicial; o vendedor é obrigado a trocá-la no primeiro acesso. Vale também para o admin criado pelo seed. Enquanto não trocar, páginas redirecionam para `/trocar-senha` e as APIs devolvem 403 `PASSWORD_CHANGE_REQUIRED`. A troca derruba todas as sessões e emite uma nova.
- No primeiro acesso a tela não pede a senha provisória (o login já a provou); o servidor garante que a nova é diferente comparando com o hash. Na troca voluntária a senha atual continua obrigatória.
- Testes das regras puras com `node:test` (108 casos).
- `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run build` e `npm test` passando.
- Projeto publicado em `https://github.com/kalebhawi/ksales.git`, branch `main`.

## Comandos locais

O Docker CLI está instalado; em verificações recentes o daemon do Docker Desktop estava desligado — ligue-o antes de `npm run db:up`.

```bash
copy .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

URL local:

```text
http://localhost:3000/sales
```

Comandos disponíveis:

```text
npm run dev / build / start / lint / test
npm run db:up / db:down / db:generate / db:migrate / db:deploy / db:seed / db:studio
```

## Próximos passos prioritários

1. Tela de perfil do vendedor com foto real (upload) e histórico de atendimentos.
2. Relatórios por período, com exportação.
3. Atualização em tempo real da fila entre dispositivos (polling curto ou SSE) — hoje cada cliente recarrega após a própria ação.
4. Executar o `DEPLOY.md` na VPS: banco de produção, PM2, Nginx e certbot. Os arquivos já estão prontos em `deploy/`; nada foi executado na VPS ainda.
5. Testes de integração das rotas com banco efêmero, cobrindo permissão e transições.
6. Trocar o limitador de login em memória por Redis se a aplicação passar a rodar em mais de uma instância.

## Regras de implementação

- Não reintroduzir mocks na dashboard.
- Usar Prisma e PostgreSQL para dados persistentes.
- Toda mutation deve validar autenticação e autorização no servidor.
- Manter histórico em `QueueEvent`.
- Conclusão deve atualizar o atendimento em andamento, preencher `concludedAt` e devolver o vendedor ao FIM da fila (`RETURNED_TO_QUEUE`), nunca para `AVAILABLE`.
- Usar transações para alterar atendimento e vendedor juntos.
- Manter as regras de fila, permissão, senha e perfil puras em `src/lib`, com teste correspondente.
- Toda checagem de papel vale também na API, não só na página.
- Módulos com `node:crypto` (`password.ts`, `session.ts`) nunca podem ser importados por Client Component.
- Nunca commitar `.env`, senhas ou tokens.
- Não usar a senha SSH da VPS como senha do banco.
- Preservar o `basePath: "/sales"`.
- Validar alterações com `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run build` e `npm test`.
- HTTPS é obrigatório em produção: o cookie de sessão usa `secure: true` e o login não persiste em HTTP.
- Não fazer commit automaticamente sem solicitação explícita.
