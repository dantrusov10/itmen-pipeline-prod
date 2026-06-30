#!/usr/bin/env python3
import csv, json
rows = list(csv.DictReader(open("/tmp/psi-sheet.csv", encoding="utf-8-sig")))
print("total cols", len(rows[0].keys()) if rows else 0)
prod_cols = [k for k in rows[0].keys() if k.startswith("prod_")]
req_cols = [k for k in rows[0].keys() if k.startswith("req_")]
print("prod cols", len(prod_cols), prod_cols[:5], "...", prod_cols[-3:])
print("req cols", len(req_cols))

# any prod data at all?
any_prod = 0
for r in rows:
    for k in prod_cols:
        if (r.get(k) or "").strip():
            any_prod += 1
            break
print("rows with any prod_* data:", any_prod)

# check payload for ZOMZ
for r in rows:
    if "ЗОМЗ" in (r.get("company") or ""):
        payload = r.get("payload") or ""
        print("\nZOMZ payload len", len(payload))
        if payload:
            try:
                p = json.loads(payload)
                print("payload keys", list(p.keys())[:30])
                pr = p.get("productRequirements") or p.get("prodRequirements") or p.get("prodreq") or []
                print("productRequirements count", len(pr) if isinstance(pr, list) else type(pr))
                if isinstance(pr, list) and pr:
                    print("sample", pr[0])
            except Exception as e:
                print("payload parse err", e, payload[:200])
        # check all non-empty fields
        filled = [k for k,v in r.items() if v and k not in ("timestamp","run_id") and len(str(v))<500]
        print("filled fields count", len(filled))
        print("sample filled", filled[:40])
