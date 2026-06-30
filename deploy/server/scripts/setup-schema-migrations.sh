#!/usr/bin/env bash
# Полная цепочка миграций PocketBase после import-collections.py (v3 base).
set -euo pipefail
ROOT="${ROOT:-/opt/itmen-pipeline}"
cd "${ROOT}/scripts"

echo "==> CRM schema migrations v4 → v9"
for script in \
  apply-crm-v4-collections.py \
  apply-crm-v5-requirements.py \
  apply-crm-v6-amo-info-fields.py \
  apply-crm-v7-presale-deal-fields.py \
  apply-crm-v8-task-created-at.py \
  apply-crm-v9-presale-deals.py \
  add-entity-collections.py
do
  if [[ -f "${script}" ]]; then
    echo "---- ${script}"
    python3 "${script}"
  else
    echo "WARN: skip missing ${script}" >&2
  fi
done

if [[ -f migrate-presale-map-to-collection.py ]]; then
  echo "---- migrate-presale-map-to-collection.py (if legacy map exists)"
  python3 migrate-presale-map-to-collection.py || true
fi

echo "==> ensure pipeline users"
python3 ensure-pipeline-users.py --apply

echo "==> done"
