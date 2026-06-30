#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import re
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

URL = re.search(
    r'url:\s*"([^"]+)"',
    (Path(__file__).resolve().parent.parent / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)
INCIDENT = "2026-06-24 10:38:47"
OWNER = "Александр Сироткин"

def norm_ts(raw):
    return str(raw or "").strip().replace("T", " ").replace("Z", "")[:19]

def fetch(q):
    return json.loads(urllib.request.urlopen(URL + q, timeout=300).read().decode())

def score_sum(d):
    return sum((d.get("scores") or {}).values())

def has_tech(d):
    tr = d.get("techResearch") or {}
    segs = len(tr.get("seekingSegments") or [])
    tasks = len([t for t in (tr.get("projectTasks") or []) if str(t).strip()])
    pains = str(d.get("pains") or "").strip()
    return segs > 0 or tasks > 0 or len(pains) > 5

rows = fetch("?action=auditAll")["rows"]
state = fetch("?action=get")["state"]
sirot = {d["id"]: d for d in state["deals"] if d.get("owner") == OWNER}
ids = set(sirot)

pre = [r for r in rows if norm_ts(r[0]) < INCIDENT and str(r[2]) in ids]

# per deal: count pre fields with non-empty NEW
deal_fields = defaultdict(set)
deal_last = defaultdict(dict)
for r in pre:
    did, label = str(r[2]), str(r[6])
    if not label or label == "—":
        continue
    val = r[8]
    s = str(val or "").strip()
    if not s or s == "{}":
        continue
    if label == "Ключевые боли" and len(s) < 5:
        continue
    deal_fields[did].add(label)
    deal_last[did][label] = val

print(f"Sirotkin deals: {len(ids)}")
print(f"Deals with any pre-incident audit field: {len(deal_fields)}")
print()

filled_server = 0
for did in sorted(deal_fields.keys()):
    d = sirot[did]
    sc = score_sum(d)
    tech = has_tech(d)
    pains = bool(str(d.get("pains") or "").strip())
    nfields = len(deal_fields[did])
    cust = (d.get("customer") or "")[:32]
    print(f"{did} {cust}")
    print(f"  audit fields: {nfields} | server: score={sc} pains={pains} tech={tech}")
    print(f"  labels: {', '.join(sorted(deal_fields[did])[:8])}{'...' if nfields>8 else ''}")

# deals with good data on server
print("\n--- Server state summary ---")
with_score = [d for d in sirot.values() if score_sum(d) > 2]
with_tech = [d for d in sirot.values() if has_tech(d)]
with_pains = [d for d in sirot.values() if str(d.get("pains") or "").strip()]
print(f"score>2: {len(with_score)}")
print(f"has tech: {len(with_tech)}")
print(f"has pains: {len(with_pains)}")
for d in with_score:
    print(f"  {d['id']} {(d.get('customer') or '')[:35]} sum={score_sum(d)}")

# D-007 check all audit
print("\n--- D-007 (MinTsifry) full audit ---")
for r in rows:
    if str(r[2]) != "D-007":
        continue
    print(norm_ts(r[0]), str(r[6])[:25], str(r[8])[:50])

# incident rows for all sirotkin deals
inc = [r for r in rows if norm_ts(r[0]).startswith(INCIDENT) and str(r[2]) in ids]
inc_deals = Counter(str(r[2]) for r in inc)
print(f"\nIncident rows for Sirotkin deals: {len(inc)} across {len(inc_deals)} deals")
print(dict(inc_deals))
