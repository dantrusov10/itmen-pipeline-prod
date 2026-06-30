#!/usr/bin/env python3
import csv
rows = list(csv.DictReader(open("/tmp/psi-sheet.csv", encoding="utf-8-sig")))
z = [r for r in rows if "ЗОМЗ" in (r.get("company") or "")]
print("rows with ZOMZ:", len(z))
for r in z[:3]:
    print("---", r.get("company"), r.get("timestamp"))
    for i in range(1, 31):
        p = f"{i:02d}"
        t = (r.get(f"req_{p}_text") or "").strip()
        b = (r.get(f"prod_{p}_biz") or "").strip()
        f = (r.get(f"prod_{p}_func") or "").strip()
        if t:
            print(f"  pilot {p}: {t[:80]} feas={r.get(f'req_{p}_feas')}")
        if b or f:
            print(f"  prod {p}: biz={b[:50]} func={f[:50]} feas={r.get(f'prod_{p}_feas')}")

# count all companies with product reqs
from collections import defaultdict
import re
LEGAL = re.compile(r"^(ооо|оао|зао|пао|ао|мкпао|ип)\s+", re.I)
def norm(s):
    s = (s or "").strip().lower().replace("«","").replace("»","").replace('"','')
    s = LEGAL.sub("", s)
    return re.sub(r"\s+"," ", s.replace("ё","е")).strip()

latest = {}
for row in rows:
    c = (row.get("company") or "").strip()
    if not c: continue
    k = norm(c)
    ts = row.get("timestamp") or ""
    if k not in latest or str(ts) > str(latest[k].get("timestamp") or ""):
        latest[k] = row

prod_cos = []
for k, row in latest.items():
    n = sum(1 for i in range(1,31) if (row.get(f"prod_{i:02d}_biz") or row.get(f"prod_{i:02d}_func") or "").strip())
    if n:
        prod_cos.append((row.get("company"), n))
print("\nCompanies with PRODUCT reqs in CSV:", len(prod_cos))
for c,n in sorted(prod_cos, key=lambda x: -x[1])[:25]:
    print(f"  {n:2d}  {c}")
