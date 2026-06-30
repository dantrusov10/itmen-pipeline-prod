#!/usr/bin/env bash
# Деплой с рабочей машины на newlevel-prod (весь API + фронт + скрипты + systemd).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
HOST="${ITMEN_HOST:-newlevel-prod}"
REMOTE="/opt/itmen-pipeline"

echo "==> Deploy to ${HOST}:${REMOTE}"

scp -r "${REPO}/deploy/server/api/src" "${HOST}:${REMOTE}/api/"
scp "${REPO}/deploy/server/api/package.json" "${HOST}:${REMOTE}/api/"

ssh "${HOST}" "cd ${REMOTE}/api && npm install --omit=dev"

scp -r "${REPO}/css" "${HOST}:${REMOTE}/frontend/current/"
scp -r "${REPO}/js" "${HOST}:${REMOTE}/frontend/current/"
scp "${REPO}/index.html" "${HOST}:${REMOTE}/frontend/current/"
scp -r "${REPO}/kp" "${HOST}:${REMOTE}/frontend/current/" 2>/dev/null || true
scp -r "${REPO}/assets" "${HOST}:${REMOTE}/frontend/current/" 2>/dev/null || true

ssh "${HOST}" "chmod -R a+rX ${REMOTE}/frontend/current/css ${REMOTE}/frontend/current/js ${REMOTE}/frontend/current/assets ${REMOTE}/frontend/current/kp 2>/dev/null || true; rm -f ${REMOTE}/frontend/current/css/index.html"

scp "${REPO}/deploy/server/scripts/"*.py "${REPO}/deploy/server/scripts/"*.js "${REPO}/deploy/server/scripts/"*.sh \
  "${HOST}:${REMOTE}/scripts/" 2>/dev/null || true

scp "${REPO}/deploy/server/infra/systemd/"itmen-pipeline-* "${HOST}:/tmp/"
ssh "${HOST}" "install -m 644 /tmp/itmen-pipeline-* /etc/systemd/system/ && systemctl daemon-reload"

ssh "${HOST}" "python3 ${REMOTE}/scripts/apply-crm-v10-task-email-sent.py 2>&1 || true"
ssh "${HOST}" "systemctl restart itmen-pipeline-api"
ssh "${HOST}" "systemctl enable --now itmen-pipeline-task-email.timer 2>&1 || true"

echo "==> Health:"
ssh "${HOST}" "curl -s http://127.0.0.1:3010/api/health"
echo ""
echo "==> Done"
