#!/bin/bash
# Деплой на сервер через rsync или Vercel
# 
# Вариант 1 — Vercel (одна команда):
#   npx vercel --prod
#
# Вариант 2 — SSH/rsync (задайте переменные):
#   export DEPLOY_HOST=user@yourserver.com
#   export DEPLOY_PATH=/var/www/gtpconverter
#   ./scripts/deploy.sh

set -e

echo "Building..."
npm run build

if [ -n "$DEPLOY_HOST" ] && [ -n "$DEPLOY_PATH" ]; then
  echo "Deploying to $DEPLOY_HOST:$DEPLOY_PATH"
  rsync -avz --delete dist/ "$DEPLOY_HOST:$DEPLOY_PATH/"
  echo "Done! Deployed to server."
else
  echo ""
  echo "Deploy options:"
  echo "  1. Vercel:  npx vercel --prod"
  echo "  2. SSH:     DEPLOY_HOST=user@host DEPLOY_PATH=/path ./scripts/deploy.sh"
  echo ""
fi
