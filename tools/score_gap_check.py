#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, urllib.request
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
EXCLUDE = {"D-019", "D-117", "D-026"}
SCORE_WEIGHTS = {"loyalty":0.10,"commit":0.10,"budget":0.18,"fit":0.18,"timing":0.14,"competitive":0.10,"access":0.08,"technical":0.06,"commercial":0.06}

def fetch(p):
    with urllib.request.urlopen(URL+p, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))

def display(sc):
    if not sc or not any(v>0 for v in sc.values()): return 0
    return round(sum(sc.get(k,0)*w for k,w in SCORE_WEIGHTS.items())/5*100)

state = fetch("?action=get")["state"]
rows = fetch("?action=auditAll").get("rows") or []
deals = {d["id"]: d for d in state["deals"] if d.get("id")}

by = defaultdict(list)
for r in rows:
    if r[6]=="Скоринг" and r[2] not in EXCLUDE:
        try:
            s = sum(json.loads(str(r[8])).values())
            if s > 2:
                by[r[2]].append((r[0], s, r[8][:80]))
        except: pass

print("Score history vs prod (excl test/bashneft), deals with score<20 on prod:\n")
for did in sorted(by, key=lambda x: -max(t[1] for t in by[x])):
    deal = deals.get(did, {})
    prod = deal.get("scores") or {}
    prod_sum = sum(prod.values())
    prod_disp = display(prod)
    best = max(by[did], key=lambda t: t[1])
    if prod_disp >= 20:
        continue
    if best[1] > prod_sum + 2:
        print(f"{did} {deal.get('customer','')[:35]:35} prod_disp={prod_disp} prod_sum={prod_sum} best_audit_sum={best[1]} at {best[0]}")
