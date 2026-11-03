#!/usr/bin/env bash
# Deploy Kiddie Tube on the home server (run as ubuntu, from anywhere):
#   /opt/kiddietube/deploy/deploy.sh            # deploy origin/master
#   /opt/kiddietube/deploy/deploy.sh <git-ref>   # deploy a tag/commit
#
# Steps: fetch -> checkout -> npm ci -> API tests -> build web into a new
# folder -> migrate DB -> swap web build -> restart API -> health check.
# If the health check fails, the previous commit and web build are restored.
set -euo pipefail

APP=/opt/kiddietube
SERVICE=kiddietube
HEALTH=http://127.0.0.1:3007/api/v1/health
REF="${1:-origin/master}"
LOG=/var/log/kiddietube-deploy.log

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
cd "$APP"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "Refusing to deploy: uncommitted changes in $APP"
  exit 1
fi

PREV=$(git rev-parse HEAD)
log "=== Deploy $REF (current $PREV) ==="
git fetch --quiet --tags origin
git checkout --quiet --detach "$REF"
NEW=$(git rev-parse HEAD)
log "Checked out $NEW"

rollback() {
  log "!!! Deploy failed - rolling back to $PREV"
  git checkout --quiet --detach "$PREV"
  npm ci --no-audit --no-fund >/dev/null
  if [ -d apps/web/dist.prev ]; then rm -rf apps/web/dist && mv apps/web/dist.prev apps/web/dist; fi
  sudo systemctl restart "$SERVICE" || true
  log "Rolled back to $PREV"
  exit 1
}
trap rollback ERR

npm ci --no-audit --no-fund
log "Dependencies installed"

npm test -w @kiddietube/api
log "API tests passed"

# Build into a fresh folder; the live build keeps serving until the swap.
rm -rf apps/web/dist.next
(cd apps/web && VITE_SERVER_MODE=true BASE_PATH=/ npx vite build --outDir dist.next)
log "Web app built"

set -a; . "$APP/.env"; set +a
# Migrations only go forward: keep a restorable copy from just before them.
mkdir -p /var/backups/kiddietube
pg_dump -Fc "$DATABASE_URL" > "/var/backups/kiddietube/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
ls -1t /var/backups/kiddietube/pre-deploy-*.dump | tail -n +6 | xargs -r rm -f
log "Pre-deploy database backup taken"
npm run db:migrate -w @kiddietube/api
log "Database migrated"

rm -rf apps/web/dist.prev
[ -d apps/web/dist ] && mv apps/web/dist apps/web/dist.prev
mv apps/web/dist.next apps/web/dist
log "Web build swapped in"

sudo systemctl restart "$SERVICE"
for i in $(seq 1 20); do
  if curl -fsS -m 2 "$HEALTH" >/dev/null; then
    trap - ERR
    log "=== Deployed $NEW (healthy after ${i}s) ==="
    exit 0
  fi
  sleep 1
done
log "Health check failed"
false
