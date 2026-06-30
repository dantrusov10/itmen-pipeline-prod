#!/usr/bin/env python3
"""Add created_at date field to deal_tasks."""
import argparse
import json
import os
import urllib.request


def load_env():
    email = password = ""
    pb = os.environ.get("PB_URL", "http://127.0.0.1:8095")
    env_path = os.environ.get("ITMEN_ENV", "/opt/itmen-pipeline/.env")
    if os.path.isfile(env_path):
        for line in open(env_path, encoding="utf-8"):
            if line.startswith("PB_ADMIN_EMAIL="):
                email = line.split("=", 1)[1].strip()
            if line.startswith("PB_ADMIN_PASSWORD="):
                password = line.split("=", 1)[1].strip()
            if line.startswith("PB_URL="):
                pb = line.strip().split("=", 1)[1].strip()
    return pb.rstrip("/"), email, password


def http_json(url, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
        method=method or ("POST" if data is not None else "GET"),
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    pb, email, password = load_env()
    if not email or not password:
        raise SystemExit("PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD not found in .env")
    token = http_json(f"{pb}/api/admins/auth-with-password",
                      {"identity": email, "password": password})["token"]
    data = http_json(f"{pb}/api/collections/deal_tasks", token=token)
    coll = data if isinstance(data, dict) and "schema" in data else None
    if not coll:
        items = data.get("items", []) if isinstance(data, dict) else []
        coll = next((c for c in items if c.get("name") == "deal_tasks"), None)
    if not coll:
        raise SystemExit("deal_tasks collection not found")
    names = {f["name"] for f in coll.get("schema", [])}
    if "created_at" in names:
        print("created_at already exists")
        return
    coll["schema"].append({
        "name": "created_at",
        "type": "date",
        "required": False,
        "presentable": False,
        "unique": False,
        "options": {"min": "", "max": ""},
    })
    print("add deal_tasks.created_at")
    if args.apply:
        http_json(f"{pb}/api/collections/{coll['id']}", coll, token=token, method="PATCH")
        print("applied")


if __name__ == "__main__":
    main()
