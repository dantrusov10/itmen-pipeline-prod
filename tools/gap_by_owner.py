#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding='utf-8')).group(1)
CUTOFF = "2026-06-24T10:38:47"

LABEL_TO_KEY = {
    "Скоринг": "scores", "Ключевые боли": "pains", "Вероятность": "manualProb",
    "Ожид. бюджет": "expectedBudget", "Партнёр": "partner", "Срок задачи": "taskDue",
    "Что ищут": "seekingSegments", "% требований проекта": "productRequirementsPct",
}

def is_empty(label, raw):
    if raw is None: return True
    s = str(raw).strip()
    if not s: return True
    if label == "Скоринг":
        try: return sum(json.loads(s).values()) <= 2
        except: return True
    if label == "Ключевые боли": return len(s) < 5
    if label == "Что ищут": return len(s) < 2
    if label in ("Ожид. бюджет", "Вероятность"): return s in ("0", "0.0", "")
    return False

def fetch(q):
    return json.loads(urllib.request.urlopen(URL+q, timeout=300).read().decode())

rows = fetch("?action=auditAll")["rows"]
pre = [r for r in rows if str(r[0]) < CUTOFF]
state = fetch("?action=get")["state"]
deals = {d["id"]: d for d in state["deals"]}

timeline = defaultdict(list)
for row in pre:
    did, label, val = str(row[2]), str(row[6]), row[8]
    owner = str(row[4] or "")
    if did and label and label != "—":
        timeline[(did, label)].append((owner, val))

for owner_name in ["Александр Сироткин", "Аркадий Мерлейн", "Алексей Кулагин", "Арслан Ахметшин"]:
    gaps = []
    for (did, label), entries in timeline.items():
        last_good = None
        last_owner = None
        for o, v in entries:
            if not is_empty(label, v):
                last_good = v
                last_owner = o
        if not last_good:
            continue
        deal = deals.get(did)
        if not deal or deal.get("owner") != owner_name:
            continue
        key = LABEL_TO_KEY.get(label)
        if not key:
            continue
        if key == "scores":
            cur = deal.get("scores") or {}
            cur_s = json.dumps(cur, ensure_ascii=False)
        elif key == "seekingSegments":
            cur_s = ",".join((deal.get("techResearch") or {}).get("seekingSegments") or [])
        elif key == "productRequirementsPct":
            cur_s = str((deal.get("techResearch") or {}).get("productRequirementsPct") or "")
        else:
            cur_s = str(deal.get(key) or "")
        if is_empty(label, cur_s) and not is_empty(label, last_good):
            gaps.append((did, (deal.get("customer") or "")[:28], label, str(last_good)[:50]))
    print(f"\n{owner_name}: {len(gaps)} полей в аудите были заполнены, сейчас пусто")
    for g in gaps[:12]:
        print(f"  {g[0]} {g[1]} | {g[2]} | {g[3]}")
