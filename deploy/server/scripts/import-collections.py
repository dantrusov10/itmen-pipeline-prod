#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Импорт коллекций в PocketBase через Admin API."""
import json
import os
import sys
import urllib.error
import urllib.request

PB = os.environ.get("PB_URL", "http://127.0.0.1:8095")
EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@itmen-pipeline.local")
PASSWORD = os.environ.get("PB_ADMIN_PASSWORD", "")
SCHEMA = os.environ.get(
    "PB_SCHEMA",
    "/opt/itmen-pipeline/pb_schema/collections.import.json",
)


def req(url, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    body = None if data is None else json.dumps(data).encode("utf-8")
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}: {err[:400]}") from e


def main():
    if not PASSWORD:
        # load from .env
        env_path = "/opt/itmen-pipeline/.env"
        if os.path.exists(env_path):
            for line in open(env_path, encoding="utf-8"):
                if line.startswith("PB_ADMIN_PASSWORD="):
                    globals()["PASSWORD"] = line.split("=", 1)[1].strip()
        if not PASSWORD:
            raise SystemExit("PB_ADMIN_PASSWORD not set")

    auth = req(
        f"{PB}/api/admins/auth-with-password",
        {"identity": EMAIL, "password": PASSWORD},
    )
    token = auth.get("token")
    if not token:
        raise SystemExit("Auth failed")

    collections = json.load(open(SCHEMA, encoding="utf-8"))
    existing = req(f"{PB}/api/collections?page=1&perPage=100", token=token)
    names = {c["name"] for c in existing.get("items", [])}

    for spec in collections:
        name = spec["name"]
        if name in names:
            print(f"  skip {name} (exists)")
            continue
        # API expects collection body without wrapping
        req(f"{PB}/api/collections", spec, token=token, method="POST")
        print(f"  created {name}")

    print("Done.")


if __name__ == "__main__":
    main()
