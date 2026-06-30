#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Analyze PSI CSV: companies with pilot/product reqs vs CRM deals."""
import csv
import json
import os
import re
import urllib.parse
import urllib.request

LEGAL = re.compile(r"^(ооо|оао|зао|пао|ао|мкпао|ип)\s+", re.I)

def norm(s):
    s = (s or "").strip().lower()
    s = s.replace("«", "").replace("»", "").replace('"', "").replace("'", "")
    s = LEGAL.sub("", s)
    return re.sub(r"\s+", " ", s.replace("ё", "е")).strip()

def load_env():
    email = password = ""
    pb = "http://127.0.0.1:8095"
    for line in open("/opt/itmen-pipeline/.env", encoding="utf-8"):
        if line.startswith("PB_ADMIN_EMAIL="):
            email = line.split("=", 1)[1].strip()
        if line.startswith("PB_ADMIN_PASSWORD="):
            password = line.split("=", 1)[1].strip()
    return pb, email, password

def http_json(url, data=None, token=None, method=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = token
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=120) as res:
        raw = res.read().decode()
        return json.loads(raw) if raw else {}

def has_pilot(row):
    for i in range(1, 21):
        if (row.get(f"req_{i:02d}_text") or "").strip():
            return True
    return False

def has_product(row):
    for i in range(1, 31):
        if (row.get(f"prod_{i:02d}_biz") or "").strip() or (row.get(f"prod_{i:02d}_func") or "").strip():
            return True
    return False

def count_pilot(row):
    n = 0
    for i in range(1, 21):
        if (row.get(f"req_{i:02d}_text") or "").strip():
            n += 1
    return n

def count_product(row):
    n = 0
    for i in range(1, 31):
        if (row.get(f"prod_{i:02d}_biz") or "").strip() or (row.get(f"prod_{i:02d}_func") or "").strip():
            n += 1
    return n

def main():
    csv_path = "/tmp/psi-sheet.csv"
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))
    latest = {}
    for row in rows:
        company = (row.get("company") or "").strip()
        if not company or len(company) > 120:
            continue
        key = norm(company)
        ts = row.get("timestamp") or row.get("run_id") or ""
        prev = latest.get(key)
        if not prev or str(ts) > str(prev.get("_ts", "")):
            row["_ts"] = ts
            row["_company_raw"] = company
            latest[key] = row

    pb, email, password = load_env()
    token = http_json(f"{pb}/api/admins/auth-with-password",
                      {"identity": email, "password": password})["token"]
    deals = []
    page = 1
    while True:
        q = urllib.parse.urlencode({"page": page, "perPage": 200})
        data = http_json(f"{pb}/api/collections/deals/records?{q}", token=token)
        deals.extend(data.get("items", []))
        if page >= data.get("totalPages", 1):
            break
        page += 1

    deal_by_norm = {}
    for d in deals:
        k = norm(d.get("customer") or "")
        if k and k not in deal_by_norm:
            deal_by_norm[k] = d

    matched = []
    unmatched = []
    for key, row in sorted(latest.items(), key=lambda x: x[1].get("_company_raw", "")):
        pilot = count_pilot(row)
        product = count_product(row)
        if not pilot and not product:
            continue
        deal = deal_by_norm.get(key)
        entry = {
            "company_sheet": row.get("_company_raw"),
            "pilot_rows": pilot,
            "product_rows": product,
            "presale": row.get("presale_manager") or row.get("sales_manager") or "",
            "timestamp": row.get("timestamp") or "",
        }
        if deal:
            entry["deal_id"] = deal.get("deal_id")
            entry["customer_crm"] = deal.get("customer")
            matched.append(entry)
        else:
            # fuzzy: contains
            fuzzy = None
            for dk, dd in deal_by_norm.items():
                if key in dk or dk in key:
                    fuzzy = dd
                    break
            entry["fuzzy_deal_id"] = fuzzy.get("deal_id") if fuzzy else None
            entry["fuzzy_customer"] = fuzzy.get("customer") if fuzzy else None
            unmatched.append(entry)

    print("=== MATCHED", len(matched), "===")
    for e in matched:
        print(f"  {e['company_sheet']} -> {e['deal_id']} ({e['customer_crm']}) pilot={e['pilot_rows']} prod={e['product_rows']}")

    print("\n=== UNMATCHED", len(unmatched), "===")
    for e in unmatched:
        hint = ""
        if e.get("fuzzy_customer"):
            hint = f"  ~похоже: {e['fuzzy_customer']} ({e['fuzzy_deal_id']})"
        print(f"  {e['company_sheet']} | pilot={e['pilot_rows']} prod={e['product_rows']}{hint}")

    # ZOMZ specific
    for k, row in latest.items():
        if "зомз" in k:
            print("\n=== ZOMZ in sheet ===", row.get("_company_raw"), "pilot", count_pilot(row), "prod", count_product(row))
            print("  norm key:", k)
            print("  deal match:", deal_by_norm.get(k))

if __name__ == "__main__":
    main()
