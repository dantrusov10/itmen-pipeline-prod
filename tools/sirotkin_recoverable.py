#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from diagnose_completeness import fetch, eval_blocks, is_empty_audit, LABEL_TO_KEY, Wipe_PREFIX
from collections import defaultdict

OWNER = "Александр Сироткин"
state = fetch("?action=get")["state"]
deals = [d for d in state["deals"] if d.get("owner") == OWNER]
rows = fetch("?action=auditAll")["rows"]
pre = [r for r in rows if str(r[0] or "") < Wipe_PREFIX]

timeline = defaultdict(list)
for row in pre:
    did, label = str(row[2]), str(row[6])
    if did in {d["id"] for d in deals} and label and label != "—":
        timeline[(did, label)].append(row[8])

deal_map = {d["id"]: d for d in deals}
recoverable = []
for (did, label), vals in timeline.items():
    last_good = None
    for v in vals:
        if not is_empty_audit(label, v):
            last_good = v
    if not last_good:
        continue
    d = deal_map[did]
    key = LABEL_TO_KEY.get(label)
    if not key:
        continue
    from diagnose_completeness import TECH
    if key in TECH:
        cur = (d.get("techResearch") or {}).get(key)
    elif key == "scores":
        cur = d.get("scores")
    elif key == "riskTypes":
        cur = ", ".join(d.get("riskTypes") or [])
    else:
        cur = d.get(key)
    cur_empty = is_empty_audit(label, json.dumps(cur, ensure_ascii=False) if isinstance(cur, (dict, list)) else cur)
    if not is_empty_audit(label, last_good) and cur_empty:
        recoverable.append((did, (d.get("customer") or "")[:30], label))

blocks = defaultdict(int)
for d in deals:
    eb = eval_blocks(d)
    for k, v in eb.items():
        if k != "all" and v:
            blocks[k] += 1
    if eb["all"]:
        blocks["all"] += 1

print(f"Sirotkin {len(deals)} deals on server")
print("Blocks filled:", dict(blocks))
print(f"Still recoverable from pre-audit gaps: {len(recoverable)}")
for r in recoverable:
    print(f"  {r}")
