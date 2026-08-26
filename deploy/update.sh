#!/usr/bin/env bash
# Atualiza a aplicação já publicada. Não faz a instalação inicial —
# para isso siga o DEPLOY.md.
#
#   ssh root@vps70412.publiccloud.com.br
#   /var/www/ksales/deploy/update.sh
set -euo pipefail

APP_DIR="/var/www/ksales"
BRANCH="${1:-main}"

cd "$APP_DIR"

echo "==> Buscando $BRANCH"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Dependências"
# npm ci completo: o build precisa de typescript e tailwind, que são devDependencies.
# O postinstall roda `prisma generate`.
npm ci

echo "==> Migrations"
# migrate deploy só aplica o que já existe em prisma/migrations; nunca gera
# migration nova nem apaga dados.
npm run db:deploy

echo "==> Build"
npm run build

echo "==> Reiniciando"
# reload = zero downtime quando possível; cai para restart se o processo não existir.
pm2 reload ksales --update-env || pm2 start deploy/ecosystem.config.js
pm2 save

echo "==> Pronto. Status:"
pm2 status ksales
