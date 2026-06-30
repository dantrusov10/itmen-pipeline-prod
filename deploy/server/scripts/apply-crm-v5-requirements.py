#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CRM v5: требования к пилоту / продукту (clientmap).
  python3 apply-crm-v5-requirements.py           # dry-run
  python3 apply-crm-v5-requirements.py --apply
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

SCHEMA_VERSION = 5

NEW_COLLECTIONS = ["pilot_requirements", "product_requirements"]

DEAL_EXTRA_FIELDS = [
    {"name": "pilot_feasibility_pct", "type": "number", "noDecimal": True},
    {"name": "product_feasibility_pct", "type": "number", "noDecimal": True},
    {"name": "pilot_req_count", "type": "number", "noDecimal": True},
    {"name": "product_req_count", "type": "number", "noDecimal": True},
    {"name": "requirements_updated_at", "type": "date"},
]


def cid(name):
    return "itm" + hashlib.md5(f"itmen.coll.{name}".encode()).hexdigest()[:12]


def fid(name):
    return hashlib.md5(f"itmen.{name}".encode()).hexdigest()[:15]


CID = {n: cid(n) for n in ["deals", "pilot_requirements", "product_requirements"]}


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
    "pilot_requirements": coll_def("pilot_requirements", [
        deal_rel(required=True, cascadeDelete=True),
        fld("sort_order", "number", noDecimal=True),
        fld("business_need", "text", max=500),
        fld("client_requirement", "text", max=2000),
        fld("req_type", "text", max=40),
        fld("is_mandatory", "bool"),
        fld("feasibility", "text", max=80),
        fld("feasibility_score", "number"),
        fld("verification_metric", "text", max=500),
        fld("owner", "text", max=120),
        fld("source", "text", max=40),
        fld("legacy_run_id", "text", max=80),
        fld("updated_by", "text", max=120),
    ]),
    "product_requirements": coll_def("product_requirements", [
        deal_rel(required=True, cascadeDelete=True),
        fld("sort_order", "number", noDecimal=True),
        fld("business_requirement", "text", max=2000),
        fld("functional_requirement", "text", max=2000),
        fld("req_type", "text", max=40),
        fld("is_mandatory", "bool"),
        fld("feasibility", "text", max=80),
        fld("feasibility_score", "number"),
        fld("source", "text", max=40),
        fld("legacy_run_id", "text", max=80),
        fld("updated_by", "text", max=120),
    ]),
}


def patch_deals_collection(pb, token, apply):
    coll = get_collection(pb, token, "deals")
    if not coll:
        print("  deals: not found — skip")
        return
    schema = coll.get("schema") or []
    names = {f["name"] for f in schema}
    added = []
    for spec in DEAL_EXTRA_FIELDS:
        if spec["name"] in names:
            continue
        added.append(fld(spec["name"], spec["type"], noDecimal=spec.get("noDecimal")))
    if not added:
        print("  deals: feasibility fields already present")
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    pb, email, password = load_env()
    token = admin_token(pb, email, password)
    print(f"CRM schema v{SCHEMA_VERSION} requirements {'APPLY' if args.apply else 'DRY-RUN'}")
    patch_deals_collection(pb, token, args.apply)
    for name in NEW_COLLECTIONS:
        create_collection(pb, token, name, args.apply)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
