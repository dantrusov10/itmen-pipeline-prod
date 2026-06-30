#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""How many Sirotkin deals had lite vs full passport fields before incident."""
import json, re, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
INC = "2026-06-24 10:38:47"
OWNER = "Александр Сироткин"

def norm_ts(r):
    return str(r[0]).replace("T"," ")[:19]

rows = json.loads(urllib.request.urlopen(URL+"?action=auditAll",timeout=300).read())["rows"]
state = json.loads(urllib.request.urlopen(URL+"?action=get",timeout=300).read())["state"]
ids = [d["id"] for d in state["deals"] if d.get("owner")==OWNER]

LITE = {"Вероятность", "Срок задачи", "Срок бюджета", "Статус бюджета", "Статус коммита", "Месяц согласования", "Год согласования"}
PASSPORT = {"Скоринг", "Ключевые боли", "Риски", "Что ищут", "Что есть сейчас", "Почему меняют", "Конкуренты", "Задачи проекта", "% требований проекта", "% требований пилота"}

pre_by_deal = defaultdict(lambda: {"lite": 0, "passport": 0, "all": 0})
for r in rows:
    if norm_ts(r) >= INC:
        continue
    did = str(r[2])
    if did not in ids:
        continue
    lab = str(r[6])
    if lab in LITE:
        pre_by_deal[did]["lite"] += 1
    if lab in PASSPORT:
        pre_by_deal[did]["passport"] += 1
    pre_by_deal[did]["all"] += 1

with_passport = [d for d in ids if pre_by_deal[d]["passport"] > 0]
with_lite_only = [d for d in ids if pre_by_deal[d]["lite"] > 0 and pre_by_deal[d]["passport"] == 0]
no_audit = [d for d in ids if pre_by_deal[d]["all"] == 0]

print(f"68 deals: passport fields in pre-audit: {len(with_passport)}")
print(f"lite only (prob, budget, task): {len(with_lite_only)}")
print(f"zero audit rows: {len(no_audit)}")
print("\nPassport deals:", sorted(with_passport, key=lambda x: int(x.split('-')[1])))
print("\nTop lite-only by row count:")
for d in sorted(with_lite_only, key=lambda x: -pre_by_deal[x]["lite"])[:10]:
    print(f"  {d}: {pre_by_deal[d]['lite']} lite edits")
