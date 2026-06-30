#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция presale map из pipeline_meta.slug=presale_deals → коллекция presale_deals."""
from __future__ import annotations

import json
import subprocess
import sys

# применить схему v9
subprocess.check_call([sys.executable, "/opt/itmen-pipeline/scripts/apply-crm-v9-presale-deals.py"])

import urllib.request  # noqa: E402

PB = "http://127.0.0.1:8095"
META_SLUG = "presale_deals"


def load_env():
    email = password = ""
    for line in open("/opt/itmen-pipeline/.env", encoding="utf-8"):
        if line.startswith("PB_ADMIN_EMAIL="):
            email = line.split("=", 1)[1].strip()
        if line.startswith("PB_ADMIN_PASSWORD="):
            password = line.split("=", 1)[1].strip()
    return email, password


def http(url, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def main():
    email, password = load_env()
    token = http(f"{PB}/api/admins/auth-with-password",
                 {"identity": email, "password": password})["token"]
    meta_rows = http(
        f'{PB}/api/collections/pipeline_meta/records?filter=slug="{META_SLUG}"&perPage=1',
        token=token,
    ).get("items", [])
    if not meta_rows:
        print("no legacy presale map in pipeline_meta")
        return
    raw = meta_rows[0].get("focus_goal") or "{}"
    try:
        pmap = json.loads(raw)
    except json.JSONDecodeError:
        print("invalid JSON in focus_goal")
        return
    if not isinstance(pmap, dict) or not pmap:
        print("empty presale map")
        return
    deals = http(f"{PB}/api/collections/deals/records?perPage=500&fields=id,deal_id", token=token)
    deal_by_id = {d["deal_id"]: d["id"] for d in deals.get("items", []) if d.get("deal_id")}
    existing = http(f"{PB}/api/collections/presale_deals/records?perPage=500&fields=deal_id", token=token)
    have = {r["deal_id"] for r in existing.get("items", []) if r.get("deal_id")}
    n = 0
    for deal_id, presale in pmap.items():
        if deal_id in have:
            continue
        body = {"deal_id": deal_id, "data": presale}
        if deal_id in deal_by_id:
            body["deal"] = deal_by_id[deal_id]
        http(f"{PB}/api/collections/presale_deals/records", body, token=token, method="POST")
        n += 1
    print(f"migrated {n} presale rows ({len(pmap)} total in legacy map)")


if __name__ == "__main__":
    main()
