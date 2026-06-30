#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CRM v6: Amo info fields on deal_info + larger file upload limit."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.request

SCHEMA_VERSION = 6
FILE_MAX_SIZE = 268435456  # 256 MB

INFO_EXTRA_FIELDS = [
    ("product_itmen", "text", 300),
    ("endpoints", "text", 500),
    ("procurement_format", "text", 200),
    ("registration_deadline", "date"),
    ("infrastructure_size", "text", 200),
    ("grade", "text", 80),
    ("closing_tool", "text", 200),
    ("functional_fit", "text", 300),
    ("test_start", "date"),
    ("test_end", "date"),
    ("distributor", "text", 200),
    ("activity_kind", "text", 200),
    ("test_os", "text", 200),
    ("planned_payment_date", "date"),
    ("shipment_date", "date"),
    ("project_map_url", "text", 500),
    ("abm_tier", "text", 80),
    ("contract_term", "text", 120),
]


def fid(name):
    return hashlib.md5(f"itmen.v6.{name}".encode()).hexdigest()[:15]


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
    elif typ == "date":
        f["options"] = {"min": "", "max": ""}
    return f


def get_collection(pb, token, name):
    data = http_json(f"{pb}/api/collections?page=1&perPage=200", token=token)
    for c in data.get("items", []):
        if c.get("name") == name:
            return c
    return None


def patch_deal_info(pb, token, apply):
    coll = get_collection(pb, token, "deal_info")
    if not coll:
        print("  deal_info: not found")
        return
    schema = coll.get("schema") or []
    names = {f["name"] for f in schema}
    added = []
    for spec in INFO_EXTRA_FIELDS:
        name = spec[0]
        if name in names:
            continue
        if spec[1] == "text":
            added.append(make_field(name, "text", spec[2]))
        else:
            added.append(make_field(name, "date"))
    if not added:
        print("  deal_info: amo fields already present")
        return
    print(f"  deal_info: add {[f['name'] for f in added]}")
    if apply:
        coll["schema"] = schema + added
        http_json(f"{pb}/api/collections/{coll['id']}", coll, token=token, method="PATCH")


def patch_file_limit(pb, token, apply):
    coll = get_collection(pb, token, "deal_files")
    if not coll:
        print("  deal_files: not found")
        return
    schema = coll.get("schema") or []
    changed = False
    for f in schema:
        if f.get("name") == "file" and f.get("type") == "file":
            cur = (f.get("options") or {}).get("maxSize", 0)
            if cur < FILE_MAX_SIZE:
                f["options"]["maxSize"] = FILE_MAX_SIZE
                changed = True
                print(f"  deal_files.file maxSize: {cur} -> {FILE_MAX_SIZE}")
    if not changed:
        print("  deal_files: file limit ok")
        return
    if apply:
        coll["schema"] = schema
        http_json(f"{pb}/api/collections/{coll['id']}", coll, token=token, method="PATCH")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    pb, email, password = load_env()
    token = http_json(f"{pb}/api/admins/auth-with-password",
                      {"identity": email, "password": password})["token"]
    print(f"CRM schema v{SCHEMA_VERSION} {'APPLY' if args.apply else 'DRY-RUN'}")
    patch_deal_info(pb, token, args.apply)
    patch_file_limit(pb, token, args.apply)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
