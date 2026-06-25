#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CRM v4: инкрементальное добавление коллекций и полей в PocketBase.
  python3 apply-crm-v4-collections.py           # dry-run
  python3 apply-crm-v4-collections.py --apply
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

SCHEMA_VERSION = 4

NEW_COLLECTIONS = [
    "deal_activities", "deal_tasks", "deal_files", "deal_contacts", "deal_info",
    "user_profiles", "notifications", "saved_views", "report_presets",
]

LOSS_REASONS = [
    "Нет бюджета", "Выбрали конкурента", "Проект заморожен", "Нет ЛПР / контакта",
    "Не подошло решение", "Сроки не совпали", "Другое",
]


def cid(name):
    return "itm" + hashlib.md5(f"itmen.coll.{name}".encode()).hexdigest()[:12]


def fid(name):
    return hashlib.md5(f"itmen.{name}".encode()).hexdigest()[:15]


CID = {n: cid(n) for n in [
    "deals", "deal_activities", "deal_tasks", "deal_files", "deal_contacts", "deal_info",
    "user_profiles", "notifications", "saved_views", "report_presets",
]}


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


def admin_token(pb, email, password):
    return http_json(f"{pb}/api/admins/auth-with-password",
                     {"identity": email, "password": password})["token"]


def get_collection(pb, token, name):
    data = http_json(f"{pb}/api/collections?page=1&perPage=200", token=token)
    for c in data.get("items", []):
        if c.get("name") == name:
            return c
    return None


def fld(name, typ, **opts):
    f = {
        "system": False, "id": fid(name), "name": name, "type": typ,
        "required": bool(opts.get("required")), "presentable": bool(opts.get("presentable")),
        "unique": bool(opts.get("unique")),
    }
    if typ == "text":
        f["options"] = {"min": None, "max": opts.get("max"), "pattern": opts.get("pattern", "")}
    elif typ == "number":
        f["options"] = {"min": None, "max": None, "noDecimal": bool(opts.get("noDecimal"))}
    elif typ == "date":
        f["options"] = {"min": "", "max": ""}
    elif typ == "editor":
        f["options"] = {"convertUrls": False}
    elif typ == "bool":
        f["options"] = {}
    elif typ == "file":
        f["options"] = {
            "maxSelect": opts.get("maxSelect", 1),
            "maxSize": opts.get("maxSize", 52428800),
            "mimeTypes": opts.get("mimeTypes", []),
            "thumbs": [], "protected": False,
        }
    elif typ == "relation":
        f["options"] = {
            "collectionId": opts["collectionId"],
            "cascadeDelete": bool(opts.get("cascadeDelete", True)),
            "minSelect": opts.get("minSelect", 1 if opts.get("required") else 0),
            "maxSelect": opts.get("maxSelect", 1),
            "displayFields": opts.get("displayFields", []),
        }
    return f


def deal_rel(**kw):
    return fld("deal", "relation", collectionId=CID["deals"],
               displayFields=["deal_id", "customer"], **kw)


PUBLIC = {"listRule": "", "viewRule": "", "createRule": None, "updateRule": None, "deleteRule": None}


def coll_def(name, fields, rules=None):
    rules = rules or PUBLIC
    return {
        "id": CID[name], "name": name, "type": "base", "system": False,
        "schema": fields, "indexes": rules.get("indexes", []),
        "listRule": rules.get("listRule", ""), "viewRule": rules.get("viewRule", ""),
        "createRule": rules.get("createRule"), "updateRule": rules.get("updateRule"),
        "deleteRule": rules.get("deleteRule"),
    }


COLLECTION_DEFS = {
    "deal_activities": coll_def("deal_activities", [
        deal_rel(required=True),
        fld("activity_type", "text", required=True, max=40),
        fld("body", "editor"),
        fld("author", "text", max=120),
        fld("author_email", "text", max=120),
        fld("meta_json", "editor"),
        fld("activity_at", "date"),
        fld("ref_id", "text", max=40),
    ]),
    "deal_tasks": coll_def("deal_tasks", [
        deal_rel(required=True),
        fld("title", "text", required=True, max=300),
        fld("description", "editor"),
        fld("assignee", "text", max=120),
        fld("due_at", "date"),
        fld("done_at", "date"),
        fld("reminder_at", "date"),
        fld("status", "text", max=20),
        fld("activity_id", "text", max=40),
        fld("created_by", "text", max=120),
    ]),
    "deal_files": coll_def("deal_files", [
        deal_rel(required=True),
        fld("file", "file", maxSize=52428800),
        fld("label", "text", max=80),
        fld("original_name", "text", max=300),
        fld("size", "number", noDecimal=True),
        fld("mime_type", "text", max=120),
        fld("uploaded_by", "text", max=120),
        fld("uploaded_at", "date"),
    ]),
    "deal_contacts": coll_def("deal_contacts", [
        deal_rel(required=True),
        fld("name", "text", max=200),
        fld("email", "text", max=200),
        fld("phone", "text", max=80),
        fld("role", "text", max=120),
        fld("sort_order", "number", noDecimal=True),
        fld("is_primary", "bool"),
    ]),
    "deal_info": coll_def("deal_info", [
        deal_rel(required=True),
        fld("company_name", "text", max=300),
        fld("company_inn", "text", max=20),
        fld("company_kpp", "text", max=20),
        fld("company_ogrn", "text", max=20),
        fld("company_address", "editor"),
        fld("website", "text", max=300),
        fld("utm_source", "text", max=120),
        fld("utm_medium", "text", max=120),
        fld("utm_campaign", "text", max=200),
        fld("utm_content", "text", max=200),
        fld("utm_term", "text", max=200),
        fld("source_channel", "text", max=120),
        fld("landing_page", "text", max=500),
        fld("referrer", "text", max=500),
        fld("lead_date", "date"),
        fld("notes", "editor"),
    ]),
    "user_profiles": coll_def("user_profiles", [
        fld("user_id", "text", required=True, unique=True, max=40),
        fld("email", "text", max=200),
        fld("avatar", "file", maxSize=5242880, mimeTypes=["image/jpeg", "image/png", "image/webp"]),
        fld("notify_email", "bool"),
        fld("notify_task_due", "bool"),
        fld("notify_deal_assigned", "bool"),
        fld("notify_comments", "bool"),
        fld("phone", "text", max=80),
    ]),
    "notifications": coll_def("notifications", [
        fld("user_id", "text", required=True, max=40),
        fld("title", "text", max=200),
        fld("message", "editor"),
        fld("link", "text", max=500),
        fld("read", "bool"),
        fld("created_at", "date"),
        fld("type", "text", max=40),
    ]),
    "saved_views": coll_def("saved_views", [
        fld("user_id", "text", required=True, max=40),
        fld("name", "text", required=True, max=120),
        fld("page", "text", max=40),
        fld("spec_json", "editor"),
        fld("is_default", "bool"),
    ]),
    "report_presets": coll_def("report_presets", [
        fld("user_id", "text", required=True, max=40),
        fld("name", "text", required=True, max=120),
        fld("entity", "text", max=40),
        fld("columns_json", "editor"),
        fld("filters_json", "editor"),
        fld("group_by", "text", max=80),
        fld("chart_type", "text", max=20),
        fld("chart_config_json", "editor"),
        fld("is_shared", "bool"),
    ]),
}

DEAL_EXTRA_FIELDS = [
    fld("archived", "bool"),
    fld("archived_at", "date"),
    fld("loss_reason", "text", max=200),
    fld("duplicate_of", "text", max=20),
]


def patch_deals_collection(pb, token, apply):
    coll = get_collection(pb, token, "deals")
    if not coll:
        print("  deals collection not found — skip")
        return
    schema = coll.get("schema") or []
    names = {f["name"] for f in schema}
    added = [f for f in DEAL_EXTRA_FIELDS if f["name"] not in names]
    if not added:
        print("  deals: extra fields already present")
        return
    print(f"  deals: add fields {[f['name'] for f in added]}")
    if apply:
        coll["schema"] = schema + added
        http_json(f"{pb}/api/collections/{coll['id']}", coll, token=token, method="PATCH")
        print("  deals: patched")


def create_collection(pb, token, name, apply):
    if get_collection(pb, token, name):
        print(f"  {name}: exists")
        return
    body = COLLECTION_DEFS[name]
    print(f"  {name}: create ({len(body['schema'])} fields)")
    if apply:
        http_json(f"{pb}/api/collections", body, token=token, method="POST")


def seed_loss_reasons(pb, token, apply):
    rows = []
    page = 1
    while True:
        q = f'list_key="loss_reasons"'
        data = http_json(
            f"{pb}/api/collections/list_items/records?page={page}&perPage=200"
            f"&filter={urllib.parse.quote(q)}",
            token=token,
        )
        rows.extend(data.get("items", []))
        if page >= data.get("totalPages", 1):
            break
        page += 1
    existing = {r.get("value") for r in rows}
    for i, val in enumerate(LOSS_REASONS):
        if val in existing:
            continue
        print(f"  list_items loss_reasons: +{val}")
        if apply:
            http_json(f"{pb}/api/collections/list_items/records", {
                "list_key": "loss_reasons",
                "value": val,
                "sort_order": i,
                "active": True,
            }, token=token, method="POST")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    pb, email, password = load_env()
    token = admin_token(pb, email, password)
    print(f"CRM schema v{SCHEMA_VERSION} {'APPLY' if args.apply else 'DRY-RUN'}")
    patch_deals_collection(pb, token, args.apply)
    for name in NEW_COLLECTIONS:
        create_collection(pb, token, name, args.apply)
    seed_loss_reasons(pb, token, args.apply)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
