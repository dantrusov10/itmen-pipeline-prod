#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Добавить стадию «Отказ» в list_items (stages), если её ещё нет."""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

STAGE = "Отказ"


def load_env():
    email = os.environ.get("PB_ADMIN_EMAIL", "")
    password = os.environ.get("PB_ADMIN_PASSWORD", "")
    pb = os.environ.get("PB_URL", "http://127.0.0.1:8095")
    path = "/opt/itmen-pipeline/.env"
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k == "PB_ADMIN_EMAIL" and not email:
                email = v
            elif k == "PB_ADMIN_PASSWORD" and not password:
                password = v
            elif k == "PB_URL" and not pb:
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


def list_all(pb, token, collection, filter_q=""):
    rows = []
    page = 1
    while True:
        q = f"page={page}&perPage=200"
        if filter_q:
            q += f"&filter={urllib.parse.quote(filter_q)}"
        data = http_json(f"{pb}/api/collections/{collection}/records?{q}", token=token)
        rows.extend(data.get("items", []))
        if page >= data.get("totalPages", 1):
            break
        page += 1
    return rows


def main():
    pb, email, password = load_env()
    token = http_json(f"{pb}/api/admins/auth-with-password",
                      {"identity": email, "password": password})["token"]

    stages = list_all(pb, token, "list_items", 'list_key="stages"')
    values = [s.get("value") for s in stages]
    if STAGE in values:
        print(f"Стадия «{STAGE}» уже есть ({len(values)} стадий)")
        return 0

    max_order = max((s.get("sort_order") or 0 for s in stages), default=-1)
    rid = "itm" + hashlib.md5(f"itmen.list.stages.{STAGE}".encode()).hexdigest()[:12]
    body = {
        "list_key": "stages",
        "value": STAGE,
        "sort_order": max_order + 1,
        "active": True,
    }
    try:
        http_json(f"{pb}/api/collections/list_items/records", body, token=token, method="POST")
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        http_json(f"{pb}/api/collections/list_items/records/{rid}", body, token=token, method="PATCH")
    print(f"Добавлена стадия «{STAGE}» (sort_order={max_order + 1})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
