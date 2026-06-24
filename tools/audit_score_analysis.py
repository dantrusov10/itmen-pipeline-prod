#!/usr/bin/env python3
import json, re, urllib.request
from collections import defaultdict
from pathlib import Path

url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding='utf-8')).group(1)
rows = json.loads(urllib.request.urlopen(url+'?action=auditAll', timeout=300).read()).get('rows') or []
CUTOFF = "2026-06-24T10:38:47"

score_edits = defaultdict(int)
field_edits = defaultdict(int)
by_owner_score = defaultdict(int)

for row in rows:
    ts = str(row[0] or "")
    if ts >= CUTOFF:
        continue
    owner, deal_id, label = str(row[4] or row[1]), str(row[2]), str(row[6])
    if label == "Скоринг":
        try:
            if sum(json.loads(str(row[8] or "{}")).values()) > 2:
                score_edits[deal_id] += 1
                by_owner_score[owner] += 1
        except Exception:
            pass
    if label and label != "—":
        field_edits[owner] += 1

print("Owners with meaningful SCORE in audit (before wipe):")
for o, n in sorted(by_owner_score.items(), key=lambda x: -x[1]):
    print(f"  {o}: {n} score edits")

print(f"\nDeals with score edits: {len(score_edits)}")
print("\nAll field edits by owner (before wipe):")
for o, n in sorted(field_edits.items(), key=lambda x: -x[1]):
    print(f"  {o}: {n}")

# last good score per deal from audit
last_score = {}
for row in rows:
    if str(row[6]) != "Скоринг":
        continue
    deal_id = str(row[2])
    try:
        sc = json.loads(str(row[8] or "{}"))
        if sum(sc.values()) > 2:
            last_score[deal_id] = (str(row[0]), sum(sc.values()), str(row[4] or row[1]))
    except Exception:
        pass

state = json.loads(urllib.request.urlopen(url+'?action=get', timeout=120).read())['state']
need_restore = []
for d in state['deals']:
    did = d['id']
    if did not in last_score:
        continue
    cur = sum((d.get('scores') or {}).values())
    if cur <= 2:
        need_restore.append((d.get('owner'), did, d.get('customer','')[:30], last_score[did][1], cur))

print(f"\nDeals with good score in audit but empty now: {len(need_restore)}")
by_o = defaultdict(int)
for o, *_ in need_restore:
    by_o[o] += 1
for o, n in sorted(by_o.items(), key=lambda x: -x[1]):
    print(f"  {o}: {n}")
for r in need_restore[:15]:
    print(f"  {r}")
