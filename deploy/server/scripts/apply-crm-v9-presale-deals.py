#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CRM v9: коллекция presale_deals (одна строка на сделку, JSON data)."""
from __future__ import annotations

import hashlib
import json
import os
import urllib.request

SCHEMA_VERSION = 9


def fid(name):
    return hashlib.md5(f"itmen.v9.{name}".encode()).hexdigest()[:15]


def cid(name):
    return "itm" + hashlib.md5(f"itmen.coll.{name}".encode()).hexdigest()[:12]


def load_env():
    email = password = ""
    pb = os.environ.get("PB_URL", "http://127.0.0.1:8095")
    path = "/opt/itmen-pipeline/.env"
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k == "PB_ADMIN_EMAIL":
                email = v
            elif k == "PB_ADMIN_PASSWORD":
                password = v
            elif k == "PB_URL":
                pb = v
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
    deals = get_collection(pb, token, "deals")
    if not deals:
        raise SystemExit("deals collection not found")
    if get_collection(pb, token, "presale_deals"):
        print("presale_deals already exists")
    else:
        col = {
            "id": cid("presale_deals"),
            "name": "presale_deals",
            "type": "base",
            "system": False,
            "schema": [
                {
                    "system": False, "id": fid("deal_id"), "name": "deal_id", "type": "text",
                    "required": True, "presentable": True, "unique": True,
                    "options": {"min": None, "max": 32, "pattern": ""},
                },
                {
                    "system": False, "id": fid("deal"), "name": "deal", "type": "relation",
                    "required": False, "presentable": False, "unique": False,
                    "options": {
                        "collectionId": deals["id"],
                        "cascadeDelete": True,
                        "minSelect": 0, "maxSelect": 1,
                        "displayFields": ["deal_id", "customer"],
                    },
                },
                {
                    "system": False, "id": fid("data"), "name": "data", "type": "json",
                    "required": False, "presentable": False, "unique": False,
                    "options": {"maxSize": 2000000},
                },
            ],
            "indexes": [
                "CREATE UNIQUE INDEX idx_presale_deals_deal_id ON presale_deals (deal_id)",
            ],
            "listRule": "",
            "viewRule": "",
            "createRule": "",
            "updateRule": "",
            "deleteRule": "",
        }
        http_json(f"{pb}/api/collections", col, token=token, method="POST")
        print("created presale_deals")
    print("done v9")


if __name__ == "__main__":
    main()
