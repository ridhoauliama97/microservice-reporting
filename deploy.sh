#!/usr/bin/env bash
#
# deploy.sh — deploy report-service ke server WPS (192.168.10.100) lewat SSH.
#
# Pemakaian:
#   ./deploy.sh                          # deploy origin/main (default)
#   DEPLOY_BRANCH=development ./deploy.sh
#
# Prasyarat:
#   - Kunci SSH sudah terdaftar di server (OpenSSH Server + authorized_keys).
#   - Docker Desktop di server sudah MENYALA dan memakai Linux containers.
#   - Perubahan sudah di-PUSH ke GitHub. Script ini menarik dari
#     origin/<branch>, BUKAN dari working tree lokal Anda.
#
# Semua nilai bisa dioverride lewat environment variable, mis.:
#   DEPLOY_HOST=192.168.10.100 DEPLOY_USER=Ridho ./deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")"

DEPLOY_HOST="${DEPLOY_HOST:-192.168.10.100}"
DEPLOY_USER="${DEPLOY_USER:-Ridho}"
DEPLOY_DIR="${DEPLOY_DIR:-C:\\services\\report-service}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DOCKER_EXE="${DOCKER_EXE:-C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe}"
# Helper credential dummy di server (perlu karena sesi SSH tidak punya
# credential session Windows, sehingga pull image gagal tanpa ini).
HELPER_DIR="${HELPER_DIR:-%USERPROFILE%\\.docker-anon\\bin}"
APP_PORT="${APP_PORT:-5007}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR)
TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[1;36m'; C_OK=$'\033[1;32m'; C_ERR=$'\033[1;31m'; C_WARN=$'\033[1;33m'
else
  C_RESET=; C_INFO=; C_OK=; C_ERR=; C_WARN=
fi
log()  { printf '\n%s==> %s%s\n' "$C_INFO" "$*" "$C_RESET"; }
ok()   { printf '%s    OK  %s%s\n' "$C_OK" "$*" "$C_RESET"; }
warn() { printf '%s    !!  %s%s\n' "$C_WARN" "$*" "$C_RESET"; }
die()  { printf '%s    XX  %s%s\n' "$C_ERR" "$*" "$C_RESET" >&2; exit 1; }

# Jalankan perintah cmd.exe di server, di dalam folder project, dengan helper PATH.
remote() {
  ssh "${SSH_OPTS[@]}" "$TARGET" "set PATH=$HELPER_DIR;%PATH%&& cd /d \"$DEPLOY_DIR\" && $1"
}

# Ulangi perintah N kali (egress server sering flaky saat pull image).
retry() {
  local tries="$1"; shift
  local n=1
  until "$@"; do
    if [ "$n" -ge "$tries" ]; then return 1; fi
    warn "percobaan $n/$tries gagal, ulangi dalam 10s..."
    n=$((n+1)); sleep 10
  done
}

log "0/6  Cek repo lokal"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  LOCAL=$(git rev-parse "$DEPLOY_BRANCH" 2>/dev/null || echo "")
  REMOTE_REF=$(git rev-parse "origin/$DEPLOY_BRANCH" 2>/dev/null || echo "")
  if [ -n "$LOCAL" ] && [ -n "$REMOTE_REF" ] && [ "$LOCAL" != "$REMOTE_REF" ]; then
    warn "lokal '$DEPLOY_BRANCH' ($(git rev-parse --short "$DEPLOY_BRANCH")) != origin/$DEPLOY_BRANCH ($(git rev-parse --short "origin/$DEPLOY_BRANCH"))."
    warn "Yang ter-deploy adalah origin/$DEPLOY_BRANCH. Push dulu kalau ingin perubahan lokal ikut."
  fi
fi
ok "cek lokal selesai"

log "1/6  Cek koneksi SSH ke $TARGET"
ssh "${SSH_OPTS[@]}" "$TARGET" "echo ok" >/dev/null 2>&1 \
  || die "SSH gagal ke $TARGET. Cek jaringan / kunci SSH."
ok "SSH tersambung"

log "2/6  Cek Docker engine"
if ! ssh "${SSH_OPTS[@]}" "$TARGET" "set PATH=$HELPER_DIR;%PATH%&& \"$DOCKER_EXE\" info --format \"{{.OSType}}\"" 2>/dev/null | grep -qi linux; then
  die "Docker engine tidak jalan / bukan Linux containers. Nyalakan Docker Desktop di server dulu."
fi
ok "Docker engine (Linux) aktif"

log "3/6  Tarik source terbaru ($DEPLOY_BRANCH)"
retry 5 remote "git fetch origin $DEPLOY_BRANCH && git checkout $DEPLOY_BRANCH && git pull --ff-only origin $DEPLOY_BRANCH" \
  || die "git pull gagal (koneksi ke GitHub dari server bermasalah, atau ada perubahan lokal di server)."
remote "git log --oneline -1"
ok "source ter-update"

log "4/6  Build image"
retry 4 remote "\"$DOCKER_EXE\" compose build" || die "docker compose build gagal."
ok "image ter-build"

log "5/6  Jalankan stack"
retry 4 remote "\"$DOCKER_EXE\" compose up -d" || die "docker compose up gagal."
remote "\"$DOCKER_EXE\" compose ps"
ok "container berjalan"

log "6/6  Verifikasi /health/ready"
HEALTH=""
for i in $(seq 1 20); do
  HEALTH=$(ssh "${SSH_OPTS[@]}" "$TARGET" "curl.exe -s -m 8 http://localhost:$APP_PORT/health/ready" 2>/dev/null || true)
  if printf '%s' "$HEALTH" | grep -q '"db":true' \
     && printf '%s' "$HEALTH" | grep -q '"redis":true' \
     && printf '%s' "$HEALTH" | grep -q '"gotenberg":true'; then
    ok "$HEALTH"
    break
  fi
  if [ "$i" -eq 20 ]; then
    die "health/ready belum OK: ${HEALTH:-<tidak ada respons>}"
  fi
  sleep 3
done

printf '\n%sDEPLOY SELESAI%s  ->  http://%s:%s\n' "$C_OK" "$C_RESET" "$DEPLOY_HOST" "$APP_PORT"
