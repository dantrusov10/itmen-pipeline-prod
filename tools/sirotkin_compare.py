#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare Sirotkin completeness: initial-data vs server vs incident БЫЛО/СТАЛО."""
import json
import re
import urllib.request
from collections import defaultdict
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


def score_sum_raw(val):
    if val is None:
        return 0
    if isinstance(val, dict):
        return sum(val.values())
    try:
        return sum(json.loads(str(val)).values())
    except Exception:
        return 0


def score_sum_deal(d):
    return sum((d.get("scores") or {}).values())


def block_score(d):
    """Rough passport blocks filled count."""
    b = 0
    if d.get("customer") and d.get("stage"):
        b += 1
    sc = score_sum_deal(d)
    if sc > 2:
        b += 1
    if str(d.get("pains") or "").strip():
        b += 1
    tr = d.get("techResearch") or {}
    if tr.get("seekingSegments") or tr.get("projectTasks"):
        b += 1
    if d.get("budget") or d.get("amount"):
        b += 1
    return b


def load_initial():
    text = (ROOT / "js" / "initial-data.js").read_text(encoding="utf-8")
    m = re.search(r"window\.ITMEN_INITIAL\s*=\s*(\{.*\})\s*;", text, re.S)
    return json.loads(m.group(1))


rows = fetch("?action=auditAll")["rows"]
state = fetch("?action=get")["state"]
initial = load_initial()
init_deals = {d["id"]: d for d in initial["deals"] if d.get("owner") == OWNER}
srv_deals = {d["id"]: d for d in state["deals"] if d.get("owner") == OWNER}

# incident БЫЛО (col 7) and СТАЛО (col 8) for scoring
inc_bilo = defaultdict(list)
inc_stalo = defaultdict(list)
for r in rows:
    if not norm_ts(r[0]).startswith(INCIDENT):
        continue
    did = str(r[2])
    if did not in srv_deals:
        continue
    label = str(r[6])
    if label == "Скоринг":
        inc_bilo[did].append(score_sum_raw(r[7]))
        inc_stalo[did].append(score_sum_raw(r[8]))

print("=== Sirotkin: incident Скоринг БЫЛО vs СТАЛО vs server now ===\n")
print(f"{'ID':<8} {'customer':<28} {'БЫЛО':>5} {'СТАЛО':>6} {'server':>6} {'init':>5} blocks_srv")
for did in sorted(srv_deals.keys(), key=lambda x: int(x.split("-")[1])):
    d = srv_deals[did]
    cust = (d.get("customer") or "")[:28]
    bilo = max(inc_bilo.get(did) or [0])
    stalo = max(inc_stalo.get(did) or [0])
    srv = score_sum_deal(d)
    ini = score_sum_deal(init_deals.get(did, {}))
    blk = block_score(d)
    if bilo > 2 or stalo > 2 or srv > 2 or ini > 2 or blk >= 2:
        print(f"{did:<8} {cust:<28} {bilo:>5} {stalo:>6} {srv:>6} {ini:>5} {blk:>5}")

# Summary counts
def count_filled(deals_map, min_score=3, min_blocks=2):
    sc = sum(1 for d in deals_map.values() if score_sum_deal(d) >= min_score)
    bl = sum(1 for d in deals_map.values() if block_score(d) >= min_blocks)
    return sc, bl

print("\n=== Summary (68 deals) ===")
for name, dm in [("initial", init_deals), ("server", srv_deals)]:
    sc, bl = count_filled(dm)
    print(f"{name}: score>=3: {sc}, blocks>=2: {bl}")

# Deals where incident БЫЛО had score but server now low
lost = []
for did in srv_deals:
    bilo = max(inc_bilo.get(did) or [0])
    srv = score_sum_deal(srv_deals[did])
    if bilo > 2 and srv <= 2:
        lost.append((did, bilo, srv))
print(f"\nLost scores (БЫЛО>2, server<=2): {len(lost)}")
for x in lost:
    print(f"  {x[0]} bilo={x[1]} server={x[2]} {(srv_deals[x[0]].get('customer') or '')[:30]}")

# Deals where incident СТАЛО had good data (cache) but БЫЛО empty - never on server pre
cache_only = []
for did in srv_deals:
    bilo = max(inc_bilo.get(did) or [0])
    stalo = max(inc_stalo.get(did) or [0])
    if bilo <= 2 and stalo > 2:
        cache_only.append((did, stalo, score_sum_deal(srv_deals[did])))
print(f"\nCache-only at incident (БЫЛО<=2, СТАЛО>2): {len(cache_only)}")
for x in sorted(cache_only, key=lambda t: -t[1])[:20]:
    print(f"  {x[0]} stalo={x[1]} server_now={x[2]} {(srv_deals[x[0]].get('customer') or '')[:30]}")

# truth preview if exists
preview_path = ROOT / "tools" / "truth_state_preview.json"
if preview_path.exists():
    prev = json.loads(preview_path.read_text(encoding="utf-8"))
    prev_deals = {d["id"]: d for d in prev["deals"] if d.get("owner") == OWNER}
    sc, bl = count_filled(prev_deals)
    print(f"\ntruth_state_preview: score>=3: {sc}, blocks>=2: {bl}")
