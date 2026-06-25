#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Пересоздать все коллекции ITMen Pipeline из collections.import.json.
Удаляет пользовательские коллекции и создаёт заново (данных в PB ещё нет).
"""
import json
import os
import sys
import urllib.error
import urllib.request

PB = os.environ.get("PB_URL", "http://127.0.0.1:8095")
SCHEMA = os.environ.get("PB_SCHEMA", "/opt/itmen-pipeline/pb_schema/collections.import.json")
SKIP_DELETE = os.environ.get("PB_SKIP_DELETE", "") == "1"

# порядок удаления (зависимостей нет, но логически)
DROP_ORDER = [
    "import_log",
    "snapshots_deals",
    "snapshots_daily",
    "audit_log",
    "deal_score_history_items",
    "deal_score_history",
    "deal_scores",
    "deal_risks",
    "deal_competitors",
    "deal_change_pains",
    "deal_as_is",
    "deal_project_tasks",
    "deal_seeking_segments",
    "deal_tech",
    "deals",
    "list_items",
    "scoring_criteria",
    "managers",
    "pipeline_meta",
]


def load_env():
    env_path = "/opt/itmen-pipeline/.env"
    creds = {}
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                creds[k] = v
    return creds.get("PB_ADMIN_EMAIL", "admin@itmen-pipeline.local"), creds.get("PB_ADMIN_PASSWORD", "")


def req(url, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    body = None if data is None else json.dumps(data).encode("utf-8")
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}: {err[:500]}") from e


def delete_all_records(collection_name, token):
    total = 0
    while True:
        data = req(
            f"{PB}/api/collections/{collection_name}/records?page=1&perPage=200",
            token=token,
        )
        items = data.get("items", [])
        if not items:
            break
        for item in items:
            req(
                f"{PB}/api/collections/{collection_name}/records/{item['id']}",
                token=token,
                method="DELETE",
            )
            total += 1
    return total


def main():
    email, password = load_env()
    if not password:
        raise SystemExit("PB_ADMIN_PASSWORD missing")

    auth = req(f"{PB}/api/admins/auth-with-password", {"identity": email, "password": password})
    token = auth.get("token")
    if not token:
        raise SystemExit("Auth failed")

    specs = json.load(open(SCHEMA, encoding="utf-8"))
    target_names = {s["name"] for s in specs}

    existing = req(f"{PB}/api/collections?page=1&perPage=100", token=token)
    by_name = {c["name"]: c for c in existing.get("items", []) if not c.get("system")}

    if not SKIP_DELETE:
        for name in DROP_ORDER:
            if name not in by_name:
                continue
            c = by_name[name]
            n = delete_all_records(name, token)
            if n:
                print(f"  deleted {n} records from {name}")
            req(f"{PB}/api/collections/{c['id']}", token=token, method="DELETE")
            print(f"  dropped collection {name}")

        # удалить прочие пользовательские не из спеки (если остались)
        existing = req(f"{PB}/api/collections?page=1&perPage=100", token=token)
        for c in existing.get("items", []):
            if c.get("system") or c["name"] in target_names:
                continue
            delete_all_records(c["name"], token)
            req(f"{PB}/api/collections/{c['id']}", token=token, method="DELETE")
            print(f"  dropped extra collection {c['name']}")

    created = 0
    for spec in specs:
        name = spec["name"]
        if name in by_name and SKIP_DELETE:
            print(f"  skip {name} (exists)")
            continue
        req(f"{PB}/api/collections", spec, token=token, method="POST")
        print(f"  created {name} ({len(spec.get('schema', []))} fields)")
        created += 1

    final = req(f"{PB}/api/collections?page=1&perPage=100", token=token)
    names = sorted(c["name"] for c in final.get("items", []) if not c.get("system"))
    print(f"Done. {created} created. Collections: {', '.join(names)}")


if __name__ == "__main__":
    main()
