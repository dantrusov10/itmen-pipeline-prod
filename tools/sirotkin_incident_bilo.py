#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8")).group(1)
INCIDENT = "2026-06-24 10:38:47"
OWNER = "Александр Сироткин"


def norm_ts(raw):
    return str(raw or "").strip().replace("T", " ").replace("Z", "")[:19]


def fetch(q):
    return json.loads(urllib.request.urlopen(URL + q, timeout=300).read().decode())


def nonempty(label, val):
    if val is None:
        return False
    s = str(val).strip()
    if not s or s in ("{}", "[]", "—"):
        return False
    if label == "Скоринг":
        try:
            return sum(json.loads(s).values()) > 2
        except Exception:
            return False
    if label == "Ключевые боли":
        return len(s) >= 5
    if label in ("Риски", "Что ищут", "Конкуренты"):
        return len(s) >= 2
    if label == "Вероятность":
        try:
            return float(s) > 0
        except Exception:
            return False
    return len(s) >= 2


rows = fetch("?action=auditAll")["rows"]
state = fetch("?action=get")["state"]
ids = {d["id"] for d in state["deals"] if d.get("owner") == OWNER}

bilo_fields = defaultdict(set)
stalo_fields = defaultdict(set)
for r in rows:
    if not norm_ts(r[0]).startswith(INCIDENT):
        continue
    did = str(r[2])
    if did not in ids:
        continue
    label = str(r[6])
    if not label or label == "—":
        continue
    if nonempty(label, r[7]):
        bilo_fields[did].add(label)
    if nonempty(label, r[8]):
        stalo_fields[did].add(label)

def bucket(fields_map, min_n=1):
    return [did for did in ids if len(fields_map.get(did, set())) >= min_n]

b1 = set(bucket(bilo_fields, 3))
b2 = set(bucket(bilo_fields, 1))
s1 = set(bucket(stalo_fields, 3))
s2 = set(bucket(stalo_fields, 1))

print("At INCIDENT moment for 68 Sirotkin deals:")
print(f"  БЫЛО (server before wipe): >=3 fields: {len(b1)}, >=1 field: {len(b2)}")
print(f"  СТАЛО (cache sent):       >=3 fields: {len(s1)}, >=1 field: {len(s2)}")
print(f"  Only in БЫЛО (lost in wipe): {len(b1 - s1)}")
print(f"  Only in СТАЛО (cache better): {len(s1 - b1)}")

print("\nDeals with >=3 fields in БЫЛО:")
for did in sorted(b1, key=lambda x: int(x.split("-")[1])):
    print(f"  {did}: {sorted(bilo_fields[did])}")

print("\nDeals with >=3 fields in СТАЛО:")
for did in sorted(s1, key=lambda x: int(x.split("-")[1])):
    print(f"  {did}: {sorted(stalo_fields[did])}")

# pre-incident: any actor edits on sirotkin-owned deals
pre_any = defaultdict(set)
for r in rows:
    if norm_ts(r[0]) >= INCIDENT:
        continue
    did = str(r[2])
    if did not in ids:
        continue
    label = str(r[6])
    if nonempty(label, r[8]):
        pre_any[did].add(label)

print(f"\nPre-incident audit (any actor) deals with data: {len(pre_any)}")
for did in sorted(pre_any.keys(), key=lambda x: -len(pre_any[x]))[:15]:
    print(f"  {did}: {len(pre_any[did])} fields")

# union: best evidence of "was filled before"
union = set()
for did in ids:
    if len(bilo_fields.get(did, set())) >= 2 or len(pre_any.get(did, set())) >= 2:
        union.add(did)
print(f"\nEvidence 'filled before incident' (БЫЛО>=2 OR pre-audit>=2): {len(union)} deals")
