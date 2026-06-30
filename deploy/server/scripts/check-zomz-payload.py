#!/usr/bin/env python3
import csv, json
rows = list(csv.DictReader(open("/tmp/psi-sheet.csv", encoding="utf-8-sig")))
for r in rows:
    if "ЗОМЗ" not in (r.get("company") or ""):
        continue
    p = json.loads(r.get("payload") or "{}")
    prod_keys = [k for k in p if k.startswith("prod_")]
    req_keys = [k for k in p if k.startswith("req_")]
    print("company", r.get("company"))
    print("req_count field", r.get("req_count"), p.get("req_count"))
    print("prod keys in payload", len(prod_keys))
    for k in sorted(prod_keys)[:20]:
        if p.get(k):
            print(" ", k, ":", str(p[k])[:80])
    print("req keys with data", sum(1 for k in req_keys if p.get(k)))
    for k in sorted(req_keys):
        if k.endswith("_text") and p.get(k):
            print(" ", k, ":", str(p[k])[:80], "feas", p.get(k.replace("_text","_feas")))
    # product feasibility score
    for k in ["prodFeasScore", "feasScore", "productFeasScore", "prod_feas"]:
        if p.get(k):
            print("score", k, p.get(k))
    break
