#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
INC = "2026-06-24 10:38:47"
OWNER = "Александр Сироткин"

rows = json.loads(urllib.request.urlopen(URL+"?action=auditAll", timeout=300).read())["rows"]
state = json.loads(urllib.request.urlopen(URL+"?action=get", timeout=300).read())["state"]
own = {d["id"]: d for d in state["deals"] if d.get("owner") == OWNER}
pre = [r for r in rows if str(r[0]).replace("T"," ")[:19] < INC]
actor = [r for r in pre if str(r[1]) == OWNER]

print("pre actor rows:", len(actor))
print("unique deals (actor):", len(set(str(r[2]) for r in actor)))
print("owned by sirotkin:", len(set(str(r[2]) for r in actor) & set(own)))
print("NOT owned by sirotkin:", sorted(set(str(r[2]) for r in actor) - set(own))[:10])

print("\n--- D-022 all audit ---")
for r in rows:
    if str(r[2]) != "D-022":
        continue
    ts = str(r[0]).replace("T"," ")[:19]
    lab = str(r[6])
    extra = ""
    if lab == "Скоринг":
        try:
            o = sum(json.loads(str(r[7] or "{}")).values())
            n = sum(json.loads(str(r[8] or "{}")).values())
            extra = f" score {o}->{n}"
        except Exception:
            pass
    print(ts, lab[:22], extra)
