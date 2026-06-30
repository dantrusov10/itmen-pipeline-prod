#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CRM v7: presale_stage + presale_owner on deals collection."""
from __future__ import annotations

import hashlib
import json
import os
import urllib.request

SCHEMA_VERSION = 7

PRESALE_FIELDS = [
    ("presale_stage", "text", 120),
    ("presale_owner", "text", 120),
]


def fid(name):
    return hashlib.md5(f"itmen.v7.{name}".encode()).hexdigest()[:15]


def load_env():
    email = password = ""
    pb = os.environ.get("PB_URL", "http://127.0.0.1:8095")
    for line in open("/opt/itmen-pipeline/.env", encoding="utf-8"):
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
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def make_field(name, typ, max_len=None):
    f = {
        "system": False, "id": fid(name), "name": name, "type": typ,
        "required": False, "presentable": False, "unique": False,
    }
    if typ == "text":
        f["options"] = {"min": None, "max": max_len, "pattern": ""}
    return f


def get_collection(pb, token, name):
    data = http_json(f"{pb}/api/collections?page=1&perPage=200", token=token)
    for c in data.get("items", []):
        if c.get("name") == name:
            return c
    return None


def main():
    pb, email, password = load_env()
    token = http_json(f"{pb}/api/admins/auth-with-password",
                       {"identity": email, "password": password})["token"]
    col = get_collection(pb, token, "deals")
    if not col:
        raise SystemExit("deals collection not found")
    existing = {f.get("name") for f in col.get("schema", [])}
    added = []
    for name, typ, max_len in PRESALE_FIELDS:
        if name in existing:
            print(f"exists: {name}")
            continue
        col["schema"].append(make_field(name, typ, max_len))
        added.append(name)
        print(f"add field: {name}")
    if added:
        http_json(f"{pb}/api/collections/{col['id']}", col, token=token, method="PATCH")
        print("updated deals collection")
    meta = get_collection(pb, token, "pipeline_meta")
    if meta:
        body = meta.copy()
        body["schema_version"] = SCHEMA_VERSION
        http_json(f"{pb}/api/collections/{meta['id']}", body, token=token, method="PATCH")
    print("done v7")


if __name__ == "__main__":
    main()
