#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — build on ACR (no local Docker needed) then restart App Services
#
# Usage:
#   ./deploy.sh              # deploy both web + server
#   ./deploy.sh web          # deploy web only
#   ./deploy.sh server       # deploy server only
#
# Prerequisites:
#   - az login
# ---------------------------------------------------------------------------
set -euo pipefail

ACR="heizendev"
ACR_SERVER="heizendev.azurecr.io"
RG="heizen-developers"
TARGET="${1:-all}"

log() { echo "▶ $*"; }
ok()  { echo "✓ $*"; }

deploy_server() {
  local IMAGE="$ACR_SERVER/contract-server:latest"
  log "Building server on ACR (remote build — no local Docker needed)…"
  az acr build \
    --registry "$ACR" \
    --image "contract-server:latest" \
    --file apps/server/Dockerfile \
    .
  log "Restarting App Service contract-server…"
  az webapp restart --name contract-server --resource-group "$RG"
  ok "Server deployed → $IMAGE"
}

deploy_web() {
  local IMAGE="$ACR_SERVER/contract-web:latest"
  log "Building web on ACR (remote build — no local Docker needed)…"
  az acr build \
    --registry "$ACR" \
    --image "contract-web:latest" \
    --file apps/web/Dockerfile \
    .
  log "Restarting App Service contract-web…"
  az webapp restart --name contract-web --resource-group "$RG"
  ok "Web deployed → $IMAGE"
}

case "$TARGET" in
  server) deploy_server ;;
  web)    deploy_web    ;;
  all)
    deploy_server
    deploy_web
    ;;
  *)
    echo "Unknown target: $TARGET. Use 'web', 'server', or omit for both."
    exit 1
    ;;
esac

ok "Done."
