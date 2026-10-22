#!/usr/bin/env bash
# Deploy the latest committed code to the VM.
# Run ON the VM:  bash ~/warzone/scripts/deploy.sh
set -euo pipefail

APP_DIR=/home/ubuntu/warzone
NODE_BIN=/home/ubuntu/.nvm/versions/node/v22.23.1/bin
export PATH="$NODE_BIN:$PATH"

cd "$APP_DIR"

echo "==> [1/5] Pull latest (origin/master)"
git fetch --quiet origin
git reset --hard origin/master   # tracked source only; server/data & node_modules & dist are gitignored

echo "==> [2/5] Install deps (server + client)"
npm install --prefix server --no-audit --no-fund --silent
npm install --prefix client --no-audit --no-fund --silent

echo "==> [3/5] Build client"
npm run build --prefix client

echo "==> [4/5] Restart app (PM2)"
if pm2 describe warzone >/dev/null 2>&1; then
  pm2 restart warzone --update-env
else
  PORT=3002 pm2 start server/index.js --name warzone --update-env
fi
pm2 save

echo "==> [5/5] Health check"
sleep 3
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/api/health)
echo "HTTP $CODE"
[ "$CODE" = "200" ] || { echo "!! Health check FAILED. pm2 logs warzone"; exit 1; }
echo "Deploy OK — live on :3002 at $(git rev-parse --short HEAD)"
