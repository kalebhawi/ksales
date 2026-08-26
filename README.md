# ksales

Dashboard operacional para fila, atendimentos e vendedores da Kalebhawi.

A aplicação roda sob `basePath: "/sales"`, então localmente ela responde em
`http://localhost:3000/sales` e as APIs no navegador levam o prefixo `/sales/api`.

## Desenvolvimento

Copie `.env.example` para `.env`, inicie o PostgreSQL local, aplique as migrations e crie os dados iniciais:

```bash
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

O seed cria os papéis `admin` e `user`, sete vendedores de exemplo e um usuário
administrador. A senha vem de `SEED_ADMIN_PASSWORD`; se a variável estiver vazia,
o seed gera uma senha aleatória e a imprime **uma única vez** no terminal. Ela é
provisória: o primeiro login exige definir uma nova. Rodar o seed de novo nunca
sobrescreve a senha de um administrador já existente.

## Verificações

```bash
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
npm test
```

`npm test` usa o runner nativo do Node (`node:test`) via `tsx` e cobre as regras
puras: transições da fila, autorização e hierarquia de papéis, cálculo de
indicadores, troca de senha e validação de perfil e de imagem.

## Autenticação e autorização

- Senhas são guardadas com `scrypt` (`src/lib/password.ts`), no formato
  `scrypt$N$r$p$salt$hash`. Nenhuma senha em texto puro é persistida.
- A sessão é **de banco**: o cookie `ksales_session` (httpOnly, sameSite=lax,
  `secure` em produção, `path=/sales`) guarda um token opaco e o banco guarda
  apenas o SHA-256 dele, em `sessions`.
- `src/proxy.ts` (o antigo middleware, renomeado no Next.js 16) faz só a checagem
  otimista da presença do cookie e redireciona para `/login`. A validação real
  acontece em `src/lib/auth.ts`, dentro de cada página e route handler.
### Papéis

Hierarquia: **administrador > supervisor > vendedor**. As regras são puras em
`src/lib/authz.ts` e testadas em `tests/authz.test.ts`.

| | administrador | supervisor | vendedor |
| --- | --- | --- | --- |
| Visão geral (`/`) | sim | sim | não — cai em `/fila` |
| Fila (`/fila`) | sim | sim | sim |
| Movimentar qualquer vendedor | sim | sim | não |
| Movimentar a si mesmo | — | — | sim |
| Cadastrar vendedor | sim | sim | não |
| Cadastrar supervisor | sim | não | não |
| Editar o próprio perfil | — | — | sim |

Ninguém cria alguém do próprio nível ou acima: `assignableRoles()` devolve
`[supervisor, vendedor]` para o administrador e `[vendedor]` para o supervisor.

A visão geral é tela de supervisão, então o vendedor é bloqueado **também na
API**: `/api/metrics` responde 403 para ele, não só a página.

O vendedor edita apenas foto e descrição no próprio perfil. Nome, crachá e
nível são dados operacionais e continuam com a supervisão — `PATCH /api/perfil`
só aplica os campos permitidos e ignora o resto.
- Desativar um vendedor ou trocar sua senha revoga as sessões daquele usuário.
- `/api/auth/login` tem limite de tentativas por IP + e-mail (`src/lib/rate-limit.ts`,
  em memória — trocar por Redis se a aplicação passar a rodar em cluster).

### Senha provisória

Só o administrador cria vendedores, e a senha que ele define é sempre
**provisória**: o usuário nasce com `mustChangePassword = true`. Enquanto a
flag estiver ligada, o servidor bloqueia a aplicação inteira — páginas
redirecionam para `/trocar-senha` e as APIs respondem `403` com
`code: "PASSWORD_CHANGE_REQUIRED"`. A única rota autenticada que continua
aberta é `POST /api/auth/password`, justamente a que resolve o estado.

Ao concluir a troca, todas as sessões do usuário são derrubadas e uma nova é
emitida: nenhuma sessão aberta com a senha provisória sobrevive. Um reset feito
pelo administrador volta a ligar a flag.

Vale para todo mundo, inclusive o administrador criado pelo `db:seed`: a senha
que sai de `SEED_ADMIN_PASSWORD` (ou é gerada e impressa no terminal) também é
provisória, e o primeiro login cai direto em `/trocar-senha`.

No primeiro acesso o formulário **não pede a senha provisória** — o login que
acabou de acontecer já é a prova de que o usuário a conhece. A garantia de que a
nova senha é diferente da provisória continua valendo: o servidor compara contra
o hash guardado. Numa troca voluntária (`mustChangePassword = false`), a senha
atual continua obrigatória, senão uma sessão sequestrada trocaria a senha sem
saber a atual.

As regras de validação ficam puras em `src/lib/password-rules.ts` (sem
`node:crypto`, então valem no formulário e no servidor) e são testadas em
`tests/password.test.ts`. O hashing propriamente dito fica em
`src/lib/password.ts`, que nunca pode ser importado por Client Component.

## Conta e perfil

O avatar no topo abre o menu da conta: **Meu perfil**, **Alterar senha** e
**Sair**. Antes era um enfeite — avatar e seta sem ação nenhuma.

`/perfil` vale para todo mundo. Antes respondia **404** para quem não tinha
cadastro de vendedor, então administrador e supervisor não tinham perfil algum.

Todo mundo edita **foto e descrição**, e nada além disso. De onde vêm depende de
quem é:

| quem | foto e descrição em | onde aparecem |
| ---- | ------------------- | ------------- |
| vendedor | `sellers` / `seller_photos` | fila e ranking |
| administrador, supervisor | `users` / `user_photos` | avatar do topo |

`loadProfile` (`src/lib/profile.ts`) resolve essa diferença e devolve uma forma
única; a tela e as rotas não sabem qual das duas origens é. `/api/perfil/photo`
serve, grava e apaga a foto do perfil da sessão, com ETag para o navegador
revalidar barato.

**Nome e e-mail não são editáveis.** Para vendedor, o nome é o que aparece na
fila e fica com a supervisão; para os demais, é a identidade que assina a trilha
de auditoria. `PATCH /api/perfil` simplesmente ignora qualquer `name` no corpo —
só lê `description` e `photoUrl`.

Quem é vendedor vê ainda crachá, nível, situação na fila e os números do dia.

## Perfil do vendedor

- **Nome** é obrigatório em qualquer gravação.
- **Nível** é um inteiro de 1 a 5.
- **Foto** aceita uma URL `http(s)` **ou** upload de arquivo — os dois são
  mutuamente exclusivos, e gravar um limpa o outro.

A imagem enviada é guardada **no banco**, em `seller_photos`, e servida por
`GET /api/sellers/[id]/photo` com `ETag` (o navegador revalida com 304 em vez de
rebaixar o blob). A tabela é separada de `sellers` de propósito: a fila é lida em
lista a cada render, e um `Bytes` ali entraria em toda consulta sem `select`
explícito. A consulta da lista traz apenas o `updatedAt` da foto, nunca os bytes.

Limites em `src/lib/seller-rules.ts`: até 2 MB, apenas PNG, JPEG, WebP e GIF. O
formato é conferido pelos **magic bytes** do conteúdo, não pelo `Content-Type`
informado no upload — um PDF renomeado para `.png` é recusado. SVG fica de fora
de propósito: é XML e poderia carregar `<script>`, virando XSS na origem da
aplicação.

## Fila e atendimentos

Um vendedor está sempre em um de **três** estados: na fila, em atendimento ou
fora do turno. Não existe "disponível" — cadastro novo nasce fora do turno e
alguém precisa colocá-lo na fila.

`PATCH /api/sellers` recebe `{ id, operation, ... }`:

| operation | efeito | evento em `queue_events` |
| --------- | ------ | ------------------------ |
| `enqueue` | fora do turno entra para o fim da fila | `ENTERED_QUEUE` |
| `start`   | inicia atendimento e abre um `Atendimento` | `STARTED_SERVICE` |
| `remove`  | sai da fila com `reason` obrigatório | `REMOVED_FROM_QUEUE` / `ENDED_SHIFT` |
| `reorder` | muda a posição dentro da fila (`targetIndex`) | — |

Duas operações valem para a fila inteira e não recebem `id`. Exigem supervisão
(admin ou supervisor) e rodam em transação única, para que dois supervisores
clicando ao mesmo tempo não iniciem o atendimento do mesmo vendedor:

| operation | efeito |
| --------- | ------ |
| `start_next` | chama o primeiro da fila; 409 se a fila estiver vazia |
| `end_shift_all` | encerra o turno de todos os que estão **na fila**, com motivo `encerrar_dia` |

`end_shift_all` não toca em quem está em atendimento: há um `Atendimento` aberto,
que precisa do próprio desfecho.

### Arrastar

| gesto | efeito |
| ----- | ------ |
| cartão da fila → outra posição | muda a ordem, **com confirmação** |
| cartão da fila → coluna Em atendimento | inicia o atendimento, de qualquer posição |
| linha de Fora do turno → coluna Fila | entra no fim da fila |

Duas confirmações protegem decisões que mexem em quem atende primeiro:

- **Mudar posição** mostra de onde para onde e quem sobe ou desce junto.
- **Iniciar atendimento de quem não é o primeiro** mostra a posição e o nome de
  quem está na vez. Vale para clique, arraste e menu — todos passam por
  `startService`.

No celular o arraste nativo do HTML5 não existe, então cada cartão e cada linha
têm uma **alça** (`touch-action: none`) que inicia um arraste próprio: o dedo
leva um fantasma e a coluna sob ele vira o alvo. A alça não conflita com o toque
longo, que continua abrindo o menu de ações. O menu também traz
"Mudar posição...", para reordenar digitando o número.

Motivos aceitos em `remove`: `encerrar_dia`, `intervalo`, `banheiro` e `outro`
(este último exige `notes`). As regras ficam em `src/lib/queue.ts`, sem acesso a
banco, e são testadas em `tests/queue.test.ts`.

`PATCH /api/atendimentos` conclui o atendimento **em andamento** — nunca cria um
novo — preenchendo `action`, `concludedAt` e `concludedBy` na mesma transação em
que o vendedor **volta para o fim da fila** (`RETURNED_TO_QUEUE`).

Concluir devolve ao rodízio: quem acabou de atender entra de novo na fila,
atrás de quem ainda não atendeu. Para sair do rodízio — intervalo, banheiro,
fim de turno — existe a operação `remove`, que exige motivo.

`RETURNED_TO_QUEUE` ficou reservado para essa volta automática;
`ENTERED_QUEUE` é quando alguém coloca o vendedor na fila.

## Auditoria

Toda ação vai para um arquivo por dia de operação, sempre em modo append:

```
audit-logs/audit_log_26_08_2026.jsonl
```

A pasta é configurável por `AUDIT_LOG_DIR` (padrão `./audit-logs`) e está no
`.gitignore`. **Em produção aponte para fora da pasta de deploy**, senão cada
atualização de código leva o histórico junto.

Uma linha por evento, em JSON Lines:

```json
{"timestamp":"2026-08-26T14:37:59.659-03:00","action":"STARTED_SERVICE","label":"Entrada em atendimento","actor":{"id":"cmta…","name":"Admin","role":"admin"},"target":{"id":"cmta…","name":"Beatriz Nunes"},"details":{"posicaoAnterior":3,"origem":"fila"}}
```

JSON Lines e não texto delimitado porque nome de pessoa pode conter qualquer
caractere: com `|` ou quebra de linha um formato delimitado corromperia a linha,
e uma trilha corrompida não serve para nada. Cada linha continua sendo texto
puro, legível e greppável.

O `timestamp` é a hora da loja com o deslocamento explícito, então o instante
exato continua recuperável. O arquivo do dia segue o **dia de operação**
(`OPERATION_TIME_ZONE`), não o dia do servidor.

Registram-se: login e login recusado (com o motivo, nunca a senha tentada),
logout, troca de senha, entrada na fila, mudança de posição (de onde para onde),
entrada em atendimento (de que posição saiu), conclusão com o desfecho e a
duração, volta para a fila (com a posição), saída da fila com motivo,
encerramento do dia — uma linha por vendedor, não só o total —, cadastro,
edição, desativação e reativação de vendedores e supervisores, foto e o próprio
download da trilha.

A gravação acontece **depois do commit**: nada aparece na trilha se a transação
foi desfeita. Uma falha de disco não derruba a resposta — a ação já valeu no
banco, e devolver erro faria o usuário repetir o que já aconteceu; a falha vai
para o log do servidor.

### Download

O menu **Auditoria** é só do administrador. Supervisor executa ações que entram
no arquivo, então não pode ser quem confere o próprio rastro: para ele a API
responde 403 e a página responde 404 (não revela que existe).

| rota | efeito |
| ---- | ------ |
| `GET /api/admin/auditoria` | dias disponíveis, com contagem de linhas e tamanho |
| `GET /api/admin/auditoria/entries?de=&ate=&busca=&acao=&pagina=&porPagina=` | linhas filtradas e paginadas |
| `GET /api/admin/auditoria/download?dia=2026-08-26` | um dia |
| `GET /api/admin/auditoria/download?de=…&ate=…` | dias do período concatenados |

Nenhum nome de arquivo vem do cliente: a data é validada por `isAuditDate` e o
nome é montado por `auditFileName`, o que fecha a porta para travessia de
diretório (`?dia=../../.env` responde 400).

### Tabela na tela

A mesma tela lista os registros em tabela paginada — horário, ação, quem
executou, sobre quem e os detalhes — antes de qualquer download. Sem filtro de
data ela mostra **o dia mais recente**, que é o que alguém abre a tela querendo
ver; com `de`/`até` mostra o período.

Filtro e paginação acontecem **no servidor**: o arquivo de um dia movimentado
não precisa atravessar a rede inteiro para a tela mostrar 25 linhas. `porPagina`
só aceita 25, 50 ou 100, e `?pagina=999` cai na última página em vez de devolver
tela vazia.

A busca é livre sobre a linha inteira (quem executou, sobre quem, ação, ids e
detalhes), sem acento e sem caixa: `joao` acha `João`. Também acha pelo rótulo
legível do valor — buscar `encerrar dia` encontra `motivo: encerrar_dia`.

Chaves e valores ganham rótulo em português na tabela, mas **nada é escondido**:
chave desconhecida aparece como está, e o arquivo bruto continua no download.
Linha ilegível (disco cheio, gravação truncada) não derruba a tela — vira um
aviso com a contagem.

Um período muito longo lê no máximo `MAX_QUERY_DAYS` dias de uma vez e avisa
quantos ficaram de fora, em vez de carregar a operação inteira na memória para
mostrar 25 linhas.

## Indicadores

`/api/metrics` e as estatísticas por vendedor usam dados reais de
`status_atendimento`, recortados pelo dia de operação no fuso da loja
(`OPERATION_TIME_ZONE`, padrão `America/Sao_Paulo`) — e não pelo fuso do servidor.

### Filtro de período

A visão geral aceita um período na query string; a mesma leitura vale para a
página e para `/api/metrics`, então os dois nunca divergem. Cada período tem URL
própria e pode ser compartilhado.

| Período | Query string |
| --- | --- |
| Hoje (padrão) | *(sem parâmetro)* |
| Ontem | `?periodo=ontem` |
| Mês atual | `?periodo=mes-atual` |
| Mês passado | `?periodo=mes-passado` |
| Um dia | `?periodo=dia&de=2026-08-14` |
| Intervalo | `?periodo=intervalo&de=2026-08-01&ate=2026-08-15` |
| Mês e ano | `?periodo=mes&mes=2025-03` |

Regras em `src/lib/period.ts` (puras, cobertas por teste):

- Datas que não existem no calendário (`2026-02-30`) são recusadas em vez de
  empurradas para o mês seguinte: a tela cai em "hoje" e mostra o aviso.
- Intervalo com as pontas invertidas é reordenado, não recusado.
- O último dia do intervalo entra inteiro (`to` é a meia-noite do dia seguinte).
- A base de comparação acompanha o período: um dia contra o dia anterior, N dias
  contra os N dias anteriores, mês contra o mês anterior.
- **Mês em curso compara com o mesmo número de dias do mês anterior** — 26 dias
  contra os 31 de um mês fechado apontariam uma queda que não existe. Quando o
  mês anterior é mais curto, o trecho é limitado ao tamanho dele.
- "Em atendimento" e "na fila" são sempre o estado atual da loja, mesmo com um
  período passado selecionado: não existe "quem estava em atendimento" como
  número de fechamento.
- O ranking do período inclui vendedores desativados depois, desde que tenham
  atendido dentro dele — senão um mês fechado perderia gente sem avisar.

## Banco de dados

O schema fica em `prisma/schema.prisma`. Migrations:

- `0001_initial_operations`: usuários, papéis, vendedores, atendimentos e fila.
- `0002_sessions_and_seller_status`: tabela `sessions`, `sellers.active` e
  `queue_events.notes`.
- `0003_must_change_password`: `users.must_change_password`.
- `0004_seller_photos`: tabela `seller_photos` (imagem em `BYTEA`).
- `0005_supervisor_role`: papel `supervisor`; o papel `user` passa a se chamar `seller`.

Modelos principais:

- `User`, `Role`, `UserRole` e `Session`: autenticação, papéis extensíveis e sessões.
- `Seller`: vendedor, crachá, nível, perfil, estado atual da fila e ativação.
- `Atendimento` (tabela `status_atendimento`): ciclo do atendimento.
- `QueueEvent`: histórico das movimentações da fila, com motivo e observação.

Na VPS, configure `DATABASE_URL` como segredo e execute:

```bash
npm run db:deploy
npm run db:seed
```

## Scripts

```text
npm run dev         npm run build       npm start
npm run lint        npm test
npm run db:up       npm run db:down     npm run db:generate
npm run db:migrate  npm run db:deploy   npm run db:seed     npm run db:studio
```
