#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CRM v11: deal_snapshots — полный снимок сделки перед каждой записью (откат при потере данных)."""
from __future__ import annotations

import hashlib
import json
import os
import urllib.request

SCHEMA_VERSION = 11


def fid(name):
    return hashlib.md5(f"itmen.v11.{name}".encode()).hexdigest()[:15]


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
    if get_collection(pb, token, "deal_snapshots"):
        print("deal_snapshots already exists")
        return
    col = {
        "id": cid("deal_snapshots"),
        "name": "deal_snapshots",
        "type": "base",
        "system": False,
        "schema": [
            {"system": False, "id": fid("at"), "name": "at", "type": "text", "required": True,
             "presentable": False, "unique": False, "options": {"min": None, "max": 64, "pattern": ""}},
            {"system": False, "id": fid("deal_id"), "name": "deal_id", "type": "text", "required": True,
             "presentable": True, "unique": False, "options": {"min": None, "max": 32, "pattern": ""}},
            {"system": False, "id": fid("saved_by"), "name": "saved_by", "type": "text", "required": False,
             "presentable": False, "unique": False, "options": {"min": None, "max": 128, "pattern": ""}},
            {"system": False, "id": fid("source"), "name": "source", "type": "text", "required": False,
             "presentable": False, "unique": False, "options": {"min": None, "max": 64, "pattern": ""}},
            {"system": False, "id": fid("score_sum"), "name": "score_sum", "type": "number", "required": False,
             "presentable": False, "unique": False, "options": {"min": None, "max": None, "noDecimal": True}},
            {"system": False, "id": fid("state_json"), "name": "state_json", "type": "editor", "required": False,
             "presentable": False, "unique": False, "options": {"maxSize": 2000000}},
        ],
        "listRule": None,
        "viewRule": None,
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
    }
    http_json(f"{pb}/api/collections", col, token=token, method="POST")
    print("created deal_snapshots collection")
    print("done v11")


if __name__ == "__main__":
    main()
