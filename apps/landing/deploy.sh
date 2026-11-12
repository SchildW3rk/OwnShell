#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SSH_HOST="${SSH_HOST:?Set SSH_HOST (e.g. user@host)}"
REMOTE_PATH="${REMOTE_PATH:?Set REMOTE_PATH (landing app directory on the server)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_DOMAINS="${APP_DOMAINS:-ownshell.app, www.ownshell.app}"
APP_CONTAINER="${APP_CONTAINER:-ownshell_landing_app}"
APP_NETWORK="${APP_NETWORK:-ownshell_landing}"
CADDY_CONTAINER="${CADDY_CONTAINER:-schildw3rk_caddy}"
CADDYFILE="${CADDYFILE:?Set CADDYFILE (path of the central Caddyfile on the server)}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://ownshell.app/}"
RUN_INSTALL="${RUN_INSTALL:-0}"
RUN_LINT="${RUN_LINT:-0}"
SKIP_PUBLIC_HEALTH="${SKIP_PUBLIC_HEALTH:-0}"
REQUIRE_CHECKOUT_ENV="${REQUIRE_CHECKOUT_ENV:-1}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}[$1]${NC} $2"; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || error "Missing required command: $1"
}

BUILD_ENV_FILE=""
cleanup() {
  if [[ -n "$BUILD_ENV_FILE" ]]; then
    rm -f "$BUILD_ENV_FILE"
  fi
}
trap cleanup EXIT

has_checkout_env() {
  [[ -n "${VITE_LEMON_INDIVIDUAL_CHECKOUT_URL:-}" ]]
}

load_remote_checkout_env() {
  BUILD_ENV_FILE="$(mktemp)"

  ssh "$SSH_HOST" "REMOTE_PATH='$REMOTE_PATH' bash -s" >"$BUILD_ENV_FILE" <<'ENDSSH'
set -euo pipefail

python3 - <<'PY'
import os
import shlex
from pathlib import Path

allowed = {
    "VITE_LEMON_INDIVIDUAL_CHECKOUT_URL",
}

env_path = Path(os.environ["REMOTE_PATH"]) / ".env"
if not env_path.exists():
    raise SystemExit(0)

for raw_line in env_path.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue

    key, value = line.split("=", 1)
    key = key.strip()
    export_prefix = "export "
    if key.startswith(export_prefix):
        key = key[len(export_prefix):].strip()

    if key not in allowed:
        continue

    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]

    print(f"export {key}={shlex.quote(value)}")
PY
ENDSSH

  if [[ -s "$BUILD_ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$BUILD_ENV_FILE"
    success "Loaded checkout build env from remote .env"
  else
    warning "No checkout build env found in remote .env"
  fi

  if [[ "$REQUIRE_CHECKOUT_ENV" == "1" ]] && ! has_checkout_env; then
    error "Missing VITE_LEMON_INDIVIDUAL_CHECKOUT_URL for production deploy."
  fi
}

echo ""
echo -e "${MAGENTA}================================================${NC}"
echo -e "${MAGENTA}          OwnShell Landing Deployment           ${NC}"
echo -e "${MAGENTA}================================================${NC}"
echo ""
echo -e "  Host:    ${CYAN}${SSH_HOST}${NC}"
echo -e "  Path:    ${CYAN}${REMOTE_PATH}${NC}"
echo -e "  Domains: ${CYAN}${APP_DOMAINS}${NC}"
echo -e "  Compose: ${CYAN}${COMPOSE_FILE}${NC}"
echo ""

require_command ssh
require_command rsync
require_command npm
if [[ "$SKIP_PUBLIC_HEALTH" != "1" ]]; then
  require_command curl
fi

step "1/7" "Testing SSH connection..."
if ! ssh -o ConnectTimeout=8 "$SSH_HOST" 'true'; then
  error "Cannot connect to ${SSH_HOST}. Check SSH service, keys, firewall, or network access."
fi
success "SSH connection OK"

step "2/7" "Loading remote build env and running local verification..."
load_remote_checkout_env

if [[ "$RUN_INSTALL" == "1" ]]; then
  (cd "$REPO_ROOT" && npm install)
else
  warning "Skipping npm install because RUN_INSTALL=${RUN_INSTALL}"
fi

if [[ "$RUN_LINT" == "1" ]]; then
  (cd "$REPO_ROOT" && npm run lint --workspace=landing)
else
  warning "Skipping lint because RUN_LINT=${RUN_LINT}"
fi
success "Local verification completed"

step "3/7" "Building OwnShell landing locally..."
(cd "$REPO_ROOT" && npm run build --workspace=landing)
test -f "$SCRIPT_DIR/dist/index.html" || error "Build did not create apps/landing/dist/index.html"
success "Local build completed"

step "4/7" "Syncing static assets and container config to server..."
ssh "$SSH_HOST" "REMOTE_PATH='$REMOTE_PATH' APP_CONTAINER='$APP_CONTAINER' APP_NETWORK='$APP_NETWORK' bash -s" <<'ENDSSH'
set -euo pipefail

mkdir -p "$REMOTE_PATH/dist" "$REMOTE_PATH/config"

cat > "$REMOTE_PATH/docker-compose.yml" <<COMPOSE
services:
  app:
    image: caddy:2-alpine
    container_name: ${APP_CONTAINER}
    restart: unless-stopped
    command: ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
    volumes:
      - ./dist:/srv:ro
      - ./config/Caddyfile:/etc/caddy/Caddyfile:ro
    networks:
      - schildw3rk-proxy
      - ownshell-landing

networks:
  schildw3rk-proxy:
    external: true
  ownshell-landing:
    name: ${APP_NETWORK}
COMPOSE

cat > "$REMOTE_PATH/config/Caddyfile" <<'CADDY'
:3000 {
	encode zstd gzip
	root * /srv
	try_files {path} /index.html
	file_server
	header /assets/* Cache-Control "public, max-age=31536000, immutable"
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
CADDY
ENDSSH

rsync -az --delete "$SCRIPT_DIR/dist/" "$SSH_HOST:$REMOTE_PATH/dist/"
success "Static assets and container config synced"

step "5/7" "Starting remote OwnShell static container..."
ssh "$SSH_HOST" "REMOTE_PATH='$REMOTE_PATH' COMPOSE_FILE='$COMPOSE_FILE' CADDY_CONTAINER='$CADDY_CONTAINER' bash -s" <<'ENDSSH'
set -euo pipefail
cd "$REMOTE_PATH"

docker network create schildw3rk-proxy >/dev/null 2>&1 || true
docker network connect schildw3rk-proxy "$CADDY_CONTAINER" >/dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" up -d --force-recreate
docker image prune -f >/dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" ps
ENDSSH
success "Remote OwnShell static container started"

step "6/7" "Installing or updating central Caddy route..."
ssh "$SSH_HOST" "APP_DOMAINS='$APP_DOMAINS' APP_CONTAINER='$APP_CONTAINER' CADDYFILE='$CADDYFILE' CADDY_CONTAINER='$CADDY_CONTAINER' bash -s" <<'ENDSSH'
set -euo pipefail

python3 - <<'PY'
import os
from pathlib import Path

domains = os.environ["APP_DOMAINS"]
app_container = os.environ["APP_CONTAINER"]
caddyfile = Path(os.environ["CADDYFILE"])
caddyfile.parent.mkdir(parents=True, exist_ok=True)

start = "# -- OwnShell Landing --"
end = "# -- /OwnShell Landing --"
block = f"""{start}
{domains} {{
\troute {{
\t\theader {{
\t\t\tX-Content-Type-Options nosniff
\t\t\tX-Frame-Options DENY
\t\t\tReferrer-Policy strict-origin-when-cross-origin
\t\t\tPermissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
\t\t\tCross-Origin-Opener-Policy same-origin
\t\t\tStrict-Transport-Security "max-age=31536000; includeSubDomains; preload"
\t\t\tContent-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://ownshell.app; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
\t\t\t-Server
\t\t}}

\t\thandle /releases.json {{
\t\t\theader Cache-Control "no-store"
\t\t\treverse_proxy https://release.ownshell.app {{
\t\t\t\theader_up Host release.ownshell.app
\t\t\t}}
\t\t}}

\t\thandle {{
\t\t\treverse_proxy {app_container}:3000
\t\t}}
\t}}

\tlog {{
\t\toutput file /data/access-ownshell-landing.log {{
\t\t\troll_size 10MB
\t\t\troll_keep 5
\t\t}}
\t}}
}}
{end}
"""

content = caddyfile.read_text() if caddyfile.exists() else ""
if start in content and end in content:
    before, rest = content.split(start, 1)
    _, after = rest.split(end, 1)
    content = before.rstrip() + "\n\n" + block + after
else:
    content = content.rstrip() + "\n\n" + block + "\n"

caddyfile.write_text(content)
print(f"[OK] Updated {caddyfile}")
PY

docker run --rm -v "$CADDYFILE:/etc/caddy/Caddyfile" caddy:2-alpine caddy fmt --overwrite --config /etc/caddy/Caddyfile >/dev/null
docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile
ENDSSH
success "Central Caddy route ready"

step "7/7" "Running health checks..."
ssh "$SSH_HOST" "REMOTE_PATH='$REMOTE_PATH' COMPOSE_FILE='$COMPOSE_FILE' HEALTH_URL='$HEALTH_URL' bash -s" <<'ENDSSH'
set -euo pipefail
cd "$REMOTE_PATH"

MAX_RETRIES=20
RETRY_COUNT=0
while [ "$RETRY_COUNT" -lt "$MAX_RETRIES" ]; do
  if docker compose -f "$COMPOSE_FILE" exec -T app wget -q --spider "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[OK] Internal health check passed"
    exit 0
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "[RETRY] $RETRY_COUNT/$MAX_RETRIES waiting for OwnShell landing..."
  sleep 3
done

echo "[ERROR] Internal health check failed"
docker compose -f "$COMPOSE_FILE" logs --tail=80 app
exit 1
ENDSSH

if [[ "$SKIP_PUBLIC_HEALTH" == "1" ]]; then
  warning "Skipping public health check because SKIP_PUBLIC_HEALTH=${SKIP_PUBLIC_HEALTH}"
else
  MAX_RETRIES=20
  RETRY_COUNT=0
  until curl -fsS --max-time 15 "$PUBLIC_HEALTH_URL" >/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [[ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]]; then
      error "Public health check failed for ${PUBLIC_HEALTH_URL}"
    fi
    echo "[RETRY] $RETRY_COUNT/$MAX_RETRIES waiting for ${PUBLIC_HEALTH_URL}..."
    sleep 3
  done
  success "Public health check passed"
fi

echo ""
echo -e "${MAGENTA}================================================${NC}"
echo -e "${MAGENTA}       OwnShell deployment completed            ${NC}"
echo -e "${MAGENTA}================================================${NC}"
echo -e "  URL: ${CYAN}${PUBLIC_HEALTH_URL}${NC}"
echo ""
