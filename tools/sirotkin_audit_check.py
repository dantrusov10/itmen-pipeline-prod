#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import re
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)
INCIDENT = "2026-06-24 10:38:47"
OWNER = "Александр Сироткин"


def norm_ts(raw):
    return str(raw or "").strip().replace("T", " ").replace("Z", "")[:19]


def fetch(q):
    return json.loads(urllib.request.urlopen(URL + q, timeout=300).read().decode())


def is_empty(label, raw):
    if raw is None:
        return True
    s = str(raw).strip()
    if not s:
        return True
    if label == "Скоринг":
        try:
            return sum(json.loads(s).values()) <= 2
        except Exception:
            return True
    if label == "Ключевые боли" and len(s) < 5:
        return True
    if label in ("Риски", "Что ищут") and len(s) < 2:
        return True
    return False


rows = fetch("?action=auditAll")["rows"]
state = fetch("?action=get")["state"]
deals = {d["id"]: d for d in state["deals"] if d.get("owner") == OWNER}

pre_rows = [r for r in rows if norm_ts(r[0]) < INCIDENT and str(r[4] or "") == OWNER]
inc_rows = [r for r in rows if norm_ts(r[0]).startswith(INCIDENT) and str(r[4] or "") == OWNER]

print(f"Sirotkin deals on server: {len(deals)}")
print(f"Pre-incident audit rows (owner col): {len(pre_rows)}")
print(f"Incident audit rows: {len(inc_rows)}")

by_label = Counter(str(r[6]) for r in pre_rows)
print("\nPre-incident by label:", dict(by_label.most_common(15)))

# deals touched in pre-incident audit
pre_deals = Counter(str(r[2]) for r in pre_rows if str(r[6]) != "—")
print(f"\nUnique deals in pre audit: {len(pre_deals)}")

# last good value per deal+label from PRE (new column)
timeline = defaultdict(list)
for r in pre_rows:
    did, label, val = str(r[2]), str(r[6]), r[8]
    if did and label and label != "—":
        timeline[(did, label)].append(val)

# compare with server
gaps = []
for (did, label), vals in timeline.items():
    last_good = None
    for v in vals:
        if not is_empty(label, v):
            last_good = v
    if not last_good:
        continue
    deal = deals.get(did)
    if not deal:
        continue
    # rough current check
    key_map = {"Скоринг": "scores", "Ключевые боли": "pains", "Вероятность": "manualProb"}
    if label == "Скоринг":
        cur = json.dumps(deal.get("scores") or {}, sort_keys=True)
        good = str(last_good)
    elif label == "Ключевые боли":
        cur = str(deal.get("pains") or "")
        good = str(last_good)
    else:
        continue
    if is_empty(label, cur) and not is_empty(label, good):
        gaps.append((did, (deal.get("customer") or "")[:30], label, str(last_good)[:60]))

print(f"\nGAPS: pre had data, server empty — {len(gaps)}")
for g in gaps[:30]:
    print(f"  {g}")

# score deals in pre audit
score_deals_pre = set()
for r in pre_rows:
    if str(r[6]) == "Скоринг":
        try:
            if sum(json.loads(str(r[8])).values()) > 2:
                score_deals_pre.add(str(r[2]))
        except Exception:
            pass
print(f"\nDeals with meaningful score in PRE audit (new col): {len(score_deals_pre)}")
for did in sorted(score_deals_pre)[:20]:
    d = deals.get(did, {})
    sc = sum((d.get("scores") or {}).values())
    print(f"  {did} {(d.get('customer') or '')[:35]} server_score_sum={sc}")

# also check owner in col 1 (actor) vs col 4 (deal owner)
pre_rows_actor = [r for r in rows if norm_ts(r[0]) < INCIDENT and str(r[1] or "") == OWNER]
print(f"\nPre rows where ACTOR= Sirotkin (col1): {len(pre_rows_actor)}")
pre_deals_actor = set(str(r[2]) for r in pre_rows_actor)
print(f"Unique deal ids via actor: {len(pre_deals_actor)}")

# deals owned by sirotkin with any pre audit by deal id
any_pre = set()
for r in pre_rows:
    any_pre.add(str(r[2]))
for r in rows:
    if norm_ts(r[0]) < INCIDENT and str(r[2]) in deals:
        any_pre.add(str(r[2]))
print(f"Deals owned by Sirotkin with ANY pre audit row: {len(any_pre)}")

missing_from_rebuild = []
for did in any_pre:
    if did not in deals:
        continue
    d = deals[did]
    if sum((d.get("scores") or {}).values()) <= 2 and did in score_deals_pre:
        missing_from_rebuild.append(did)

print(f"Should have score but server empty-ish: {missing_from_rebuild}")
