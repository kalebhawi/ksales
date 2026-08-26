# Deploy do ksales na VPS

Alvo: `https://kalebhawi.com.br/sales`
Servidor: `vps70412.publiccloud.com.br` (`177.153.35.156`), Ubuntu 24.04
Acesso: `ssh root@vps70412.publiccloud.com.br`

Arquivos de apoio neste repositório:

| Arquivo | Vai para |
| ------- | -------- |
| `deploy/ecosystem.config.js` | fica no repo, usado pelo PM2 |
| `deploy/nginx/kalebhawi.conf` | `/etc/nginx/sites-available/kalebhawi.com.br` |
| `deploy/env.production.example` | modelo do `/var/www/ksales/.env` |
| `deploy/update.sh` | fica no repo, roda a cada atualização |

## Antes de começar — três coisas que quebram o deploy se ficarem para depois

1. **HTTPS é obrigatório, não opcional.** O cookie de sessão é emitido com
   `secure: true` quando `NODE_ENV=production` ([session.ts](src/lib/session.ts)).
   Em HTTP puro o navegador descarta o cookie e o login entra em laço: você
   autentica, é redirecionado, e volta para `/login`. Faça o certbot **antes** de
   testar o login.
2. **O DNS de `kalebhawi.com.br` precisa apontar para `177.153.35.156`** antes de
   rodar o certbot, senão a validação falha.
3. **A senha do banco não pode ser a senha SSH da VPS.** Gere uma independente.

---

## 1. Levantar o estado atual

Nada é alterado aqui; é só para não instalar em cima do que já existe.

```bash
ssh root@vps70412.publiccloud.com.br

node --version          # precisa ser >= 20.9 (Next.js 16)
pm2 --version
nginx -v && nginx -t
systemctl status postgresql --no-pager
psql --version
ls /etc/nginx/sites-enabled/          # já existe algo para kalebhawi.com.br?
ls /etc/letsencrypt/live/ 2>/dev/null # já existe certificado?
```

Se já houver um server block para `kalebhawi.com.br`, **não** substitua o arquivo
no passo 8 — leia a nota no início de `deploy/nginx/kalebhawi.conf`.

## 2. Node.js e PM2

Só se o passo 1 mostrou Node ausente ou abaixo de 20.9:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2
```

## 3. Banco e usuário de produção

O PostgreSQL 16 já está instalado. Gere a senha e guarde-a no seu gerenciador —
ela vai aparecer uma única vez:

```bash
DB_PASS="$(openssl rand -base64 24)"
echo "Senha do banco (guarde agora): $DB_PASS"

sudo -u postgres psql <<SQL
CREATE ROLE ksales_app WITH LOGIN PASSWORD '${DB_PASS}';
CREATE DATABASE ksales OWNER ksales_app;
REVOKE ALL ON DATABASE ksales FROM PUBLIC;
SQL
```

O `ksales_app` é dono do banco, então as migrations do Prisma conseguem criar
tabelas, tipos e índices sem precisar de superusuário.

Confirme que ele conecta e que o Postgres não está exposto para fora:

```bash
PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -U ksales_app -d ksales -c '\conninfo'
ss -lntp | grep 5432        # deve mostrar apenas 127.0.0.1:5432
```

## 4. Código

```bash
mkdir -p /var/www /var/log/ksales
git clone https://github.com/kalebhawi/ksales.git /var/www/ksales
cd /var/www/ksales
git checkout main
```

## 5. Variáveis de ambiente

```bash
cp deploy/env.production.example .env
nano .env          # cole a senha do passo 3 em DATABASE_URL
                   # e defina SEED_ADMIN_PASSWORD para a primeira carga
chmod 600 .env
```

`.env` está no `.gitignore` e não pode ser commitado em hipótese alguma.

A trilha de auditoria grava em `AUDIT_LOG_DIR`. Aponte para fora de
`/var/www/ksales`, senão o `git pull` de cada atualização convive com arquivos
de operação — e um `git clean` levaria o histórico junto:

```bash
mkdir -p /var/lib/ksales/audit-logs
chown -R ksales:ksales /var/lib/ksales/audit-logs
chmod 750 /var/lib/ksales/audit-logs
```

Esses arquivos contêm nomes e horários da operação: entram no backup e não
podem ficar legíveis para outros usuários da VPS.

## 6. Dependências e build

```bash
cd /var/www/ksales
npm ci             # completo: o build precisa de typescript e tailwind,
                   # que são devDependencies. O postinstall roda prisma generate.
npm run build
```

## 7. Migrations e carga inicial

```bash
npm run db:deploy  # aplica todas as migrations de prisma/migrations
npm run db:seed
```

O seed cria os papéis `admin` e `user`, os vendedores de exemplo e o
administrador. Se `SEED_ADMIN_PASSWORD` estiver vazio, ele **imprime uma senha
aleatória uma única vez** — copie do terminal naquele momento. Rodar o seed de
novo nunca sobrescreve a senha de um administrador existente.

Essa senha é **provisória**: no primeiro login em `/sales` a aplicação leva
direto para `/trocar-senha` e exige uma nova antes de liberar qualquer tela.

Depois da primeira carga, esvazie `SEED_ADMIN_PASSWORD` no `.env`.

## 8. PM2

```bash
cd /var/www/ksales
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root    # execute o comando que ele imprimir

pm2 status ksales
curl -I http://127.0.0.1:3000/sales       # espera-se 200 ou 307 para /sales/login
```

A aplicação escuta em `127.0.0.1:3000` de propósito — quem fala com a internet é
o Nginx. O `ecosystem.config.js` fixa `instances: 1`; leia o comentário lá antes
de aumentar.

## 9. Nginx e TLS

O arquivo declara **apenas a porta 80**. É intencional: o certbot é quem cria o
bloco 443. Se o arquivo já viesse com `ssl_certificate`, o `nginx -t` falharia,
porque `/etc/letsencrypt/live/` ainda não existe.

```bash
cp /var/www/ksales/deploy/nginx/kalebhawi.conf \
   /etc/nginx/sites-available/kalebhawi.com.br
ln -sf /etc/nginx/sites-available/kalebhawi.com.br \
       /etc/nginx/sites-enabled/kalebhawi.com.br

nginx -t && systemctl reload nginx
curl -I http://kalebhawi.com.br/sales/login   # deve responder pelo Node
```

Só agora emita o certificado. O `--nginx` duplica o server block para a 443,
preenche os caminhos dos certificados e converte o bloco 80 em redirecionamento:

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d kalebhawi.com.br -d www.kalebhawi.com.br
nginx -t && systemctl reload nginx
systemctl list-timers | grep certbot     # renovação automática
```

Dois detalhes que costumam custar tempo:

- O `proxy_pass` de `location /sales` **não tem barra no final**. Com barra, o
  Nginx removeria o prefixo `/sales` e todas as rotas dariam 404, porque o
  `basePath` do Next espera o prefixo na URL.
- Se for habilitar HTTP/2 à mão, confira `nginx -v` antes. O Ubuntu 24.04 traz o
  nginx 1.24, onde a forma correta é `listen 443 ssl http2;`. A diretiva separada
  `http2 on;` só existe a partir do 1.25.1 e derruba o `nginx -t` no 1.24.

## 10. Verificação

```bash
curl -I https://kalebhawi.com.br/sales               # 307 para /sales/login
curl -I https://kalebhawi.com.br/sales/login         # 200
curl -s -o /dev/null -w '%{http_code}\n' \
     https://kalebhawi.com.br/sales/api/sellers      # 401 sem sessão
```

No navegador, em `https://kalebhawi.com.br/sales/login`:

1. Entrar com o administrador do passo 7 e definir a senha definitiva na tela
   que aparece (a do seed é provisória).
2. Arrastar um vendedor para a **Fila**.
3. Clicar no card para iniciar o atendimento.
4. Botão direito no card → concluir com **Venda concluída**.
5. Conferir que os cards de indicadores subiram (vêm do banco, não são mock).
6. Botão direito num vendedor da fila → **Sair da fila...** → motivo obrigatório.
7. Em `/sales/admin/vendedores`, cadastrar um vendedor com e-mail e senha.
8. Sair, entrar com esse vendedor e confirmar que ele **não** consegue mover os
   outros — o menu mostra "Você só pode movimentar o seu próprio cadastro".

Logs, se algo falhar:

```bash
pm2 logs ksales --lines 100
tail -f /var/log/nginx/error.log
```

## 11. Atualizações seguintes

```bash
ssh root@vps70412.publiccloud.com.br
chmod +x /var/www/ksales/deploy/update.sh   # só na primeira vez
/var/www/ksales/deploy/update.sh
```

O script faz fetch, `npm ci`, `db:deploy`, `build` e `pm2 reload`. O
`migrate deploy` apenas aplica migrations já versionadas — nunca gera migration
nova nem apaga dados.

### Rollback

```bash
cd /var/www/ksales
git reset --hard <commit-anterior>
npm ci && npm run build
pm2 reload ksales
```

Rollback de código é direto. **Rollback de migration não é**: se a versão nova
tiver alterado o schema, volte o banco por backup, não por `git reset`. Antes de
um deploy com migration:

```bash
sudo -u postgres pg_dump -Fc ksales > /root/ksales-$(date +%F-%H%M).dump
```

## 12. Pendências conhecidas

- O limitador de tentativas de login guarda estado em memória
  ([rate-limit.ts](src/lib/rate-limit.ts)). Funciona com uma instância; se um dia
  subir para cluster ou uma segunda máquina, troque por Redis antes.
- A fila não sincroniza sozinha entre dispositivos: cada cliente recarrega após
  a própria ação. Dois atendentes na mesma tela só veem a mudança do outro no
  próximo recarregamento.
- Rodar o Node como `root` funciona, mas o ideal é um usuário dedicado
  (`adduser --system --group ksales`, `chown -R ksales:ksales /var/www/ksales`,
  e `pm2 startup systemd -u ksales`). Vale fazer antes de abrir para o time.
