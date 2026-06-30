#!/usr/bin/env python3
import csv, json
rows = list(csv.DictReader(open("/tmp/psi-sheet.csv", encoding="utf-8-sig")))
for name in ["Центр-Инвест", "АО \"ЗОМЗ\"", "ФГУП ВГТРК"]:
    for r in rows:
        if name not in (r.get("company") or ""):
            continue
        p = json.loads(r.get("payload") or "{}")
        pt = sum(1 for i in range(1,21) if (r.get(f"req_{i:02d}_text") or "").strip())
        pp = sum(1 for i in range(1,31) if (r.get(f"prod_{i:02d}_biz") or r.get(f"prod_{i:02d}_func") or "").strip())
        pt2 = sum(1 for i in range(1,21) if (p.get(f"req_{i:02d}_text") or "").strip())
        pp2 = sum(1 for i in range(1,31) if (p.get(f"prod_{i:02d}_biz") or p.get(f"prod_{i:02d}_func") or "").strip())
        print(name, "top-level pilot", pt, "product", pp, "| payload pilot", pt2, "product", pp2)
        break
