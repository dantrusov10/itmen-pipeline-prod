#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recovery status for normalized incident deals."""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
INC = "2026-06-24 10:38:47"
report = json.loads((ROOT/"tools"/"incident_normalize_report.json").read_text(encoding="utf-8"))
state = json.loads(urllib.request.urlopen(URL+"?action=get",timeout=300).read())["state"]
rows = json.loads(urllib.request.urlopen(URL+"?action=auditAll",timeout=300).read())["rows"]
deals = {d["id"]: d for d in state["deals"]}

def score_sum(d):
    return sum((d.get("scores") or {}).values())

def bilo_score(did):
    for r in rows:
        if not str(r[0]).replace("T"," ")[:19].startswith(INC):
            continue
        if str(r[2]) != did or str(r[6]) != "Скоринг":
            continue
        try:
            return sum(json.loads(str(r[7] or "{}")).values())
        except Exception:
            pass
    return 0

def has_pains(d):
    return len(str(d.get("pains") or "").strip()) >= 5

def has_tech(d):
    tr = d.get("techResearch") or {}
    return bool(tr.get("seekingSegments") or tr.get("projectTasks") or tr.get("asIsStack"))

categories = [
    ("need_restore", "ВОССТАНОВИТЬ (было заполнено + откат)"),
    ("incident_only_not_in_prefilled", "Инцидент, не в списке pre-fill"),
    ("prefilled_not_affected", "Не задело (заполнено, инцидент мимо)"),
]

for mgr, r in report.items():
    print(f"\n{'='*60}\n{r['owner']}\n{'='*60}")
    for key, title in categories:
        items = r.get(key) or []
        if not items:
            continue
        print(f"\n{title} ({len(items)}):")
        print(f"{'ID':<8} {'БЫЛО sc':>7} {'Сейчас sc':>9} pains tech  customer")
        for x in items:
            did = x["id"]
            d = deals[did]
            print(f"{did:<8} {bilo_score(did):>7} {score_sum(d):>9} {'Y' if has_pains(d) else 'n':>5} {'Y' if has_tech(d) else 'n':>4}  {(d.get('customer') or '')[:40]}")
