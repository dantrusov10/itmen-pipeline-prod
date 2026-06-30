#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Пересчитать pilot_feasibility_pct / product_feasibility_pct и deal_tech из строк требований."""
from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request

FEAS_SCORE = {
    "полностью": 1.0,
    "частично": 0.6,
    "нет": 0.0,
    "нет возможности": 0.0,
    "хард код (скоро)": 0.7,
    "хард код (не скоро)": 0.3,
    "требуется скрипт": 0.5,
}


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
            elif k == "PB_URL" and v:
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
    return http_json(
        f"{pb}/api/admins/auth-with-password",
        {"identity": email, "password": password},
    )["token"]


def list_all(pb, token, collection, filter_q=""):
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({"page": page, "perPage": 200, "filter": filter_q})
        data = http_json(f"{pb}/api/collections/{collection}/records?{q}", token=token)
        items.extend(data.get("items", []))
        if page >= data.get("totalPages", 1):
            break
        page += 1
    return items


def feas_score(label):
    if not label or str(label).strip() in ("—", "-", ""):
        return None
    return FEAS_SCORE.get(str(label).strip().lower())


def compute_pct(rows, mode):
    scores = []
    for r in rows:
        if mode == "pilot":
            if not r.get("client_requirement") and not r.get("business_need"):
                continue
        elif not r.get("functional_requirement") and not r.get("business_requirement"):
            continue
        s = r.get("feasibility_score")
        if s is None:
            s = feas_score(r.get("feasibility"))
        if s is not None:
            scores.append(float(s))
    if not scores:
        return None
    return round(sum(scores) / len(scores) * 100)


def main():
    pb, email, password = load_env()
    token = admin_token(pb, email, password)
    deals = list_all(pb, token, "deals")
    updated = 0
    for deal in deals:
        pb_id = deal["id"]
        deal_id = deal.get("deal_id", "")
        pilot_rows = list_all(pb, token, "pilot_requirements", f'deal="{pb_id}"')
        product_rows = list_all(pb, token, "product_requirements", f'deal="{pb_id}"')
        pilot_pct = compute_pct(pilot_rows, "pilot")
        product_pct = compute_pct(product_rows, "product")
        if pilot_pct is None and product_pct is None:
            continue
        body = {}
        if pilot_pct is not None:
            body["pilot_feasibility_pct"] = pilot_pct
            body["pilot_req_count"] = len(pilot_rows)
        if product_pct is not None:
            body["product_feasibility_pct"] = product_pct
            body["product_req_count"] = len(product_rows)
        if not body:
            continue
        http_json(
            f"{pb}/api/collections/deals/records/{pb_id}",
            body,
            token=token,
            method="PATCH",
        )
        tech = list_all(pb, token, "deal_tech", f'deal="{pb_id}"')
        tech_body = {
            "pilot_requirements_pct": pilot_pct if pilot_pct is not None else deal.get("pilot_feasibility_pct"),
            "product_requirements_pct": product_pct if product_pct is not None else deal.get("product_feasibility_pct"),
        }
        if tech:
            http_json(
                f"{pb}/api/collections/deal_tech/records/{tech[0]['id']}",
                tech_body,
                token=token,
                method="PATCH",
            )
        else:
            http_json(
                f"{pb}/api/collections/deal_tech/records",
                {"deal": pb_id, "seeking_other_label": "", **tech_body},
                token=token,
                method="POST",
            )
        print(deal_id, deal.get("customer", ""), "pilot", pilot_pct, "product", product_pct)
        updated += 1
    print(f"updated {updated} deals")


if __name__ == "__main__":
    main()
