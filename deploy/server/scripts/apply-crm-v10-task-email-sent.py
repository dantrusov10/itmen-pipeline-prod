#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CRM v10: deal_tasks.due_email_sent_at — отметка об отправке напоминания на почту."""
from __future__ import annotations

import hashlib
import json
import os
import urllib.request

SCHEMA_VERSION = 10


def fid(name):
    return hashlib.md5(f"itmen.v10.{name}".encode()).hexdigest()[:15]


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


def field_names(schema):
    return {f.get("name") for f in schema or []}


def main():
    pb, email, password = load_env()
    token = http_json(f"{pb}/api/admins/auth-with-password",
                      {"identity": email, "password": password})["token"]
    col = http_json(f"{pb}/api/collections/deal_tasks", token=token)
    names = field_names(col.get("schema"))
    if "due_email_sent_at" in names:
        print("due_email_sent_at already exists")
        return
    schema = list(col.get("schema") or [])
    schema.append({
        "system": False,
        "id": fid("due_email_sent_at"),
        "name": "due_email_sent_at",
        "type": "date",
        "required": False,
        "presentable": False,
        "unique": False,
        "options": {"min": "", "max": ""},
    })
    http_json(f"{pb}/api/collections/{col['id']}", {"schema": schema}, token=token, method="PATCH")
    print("added deal_tasks.due_email_sent_at")
    print("done v10")


if __name__ == "__main__":
    main()
