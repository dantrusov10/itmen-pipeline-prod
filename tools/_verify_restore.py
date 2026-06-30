#!/usr/bin/env python3
import json, re, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
state = json.loads(urllib.request.urlopen(url+"?action=get", timeout=120).read())["state"]
deals = state.get("deals", [])
print("deals", len(deals))
with_scores = sum(1 for d in deals if (d.get("scores") or {}).get("loyalty", 0) > 0)
with_pains = sum(1 for d in deals if str(d.get("pains") or "").strip())
with_comp = 0
for d in deals:
    ce = (d.get("techResearch") or {}).get("competitorEntries") or {}
    if any((e.get("vendor") or e.get("product")) for seg in ce.values() for e in (seg or [])):
        with_comp += 1
with_tr = sum(1 for d in deals if (d.get("techResearch") or {}).get("seekingSegments"))
print("with loyalty>0:", with_scores)
print("with pains:", with_pains)
print("with competitors:", with_comp)
print("with seekingSegments:", with_tr)
# sample D-002
d = next(x for x in deals if x.get("id")=="D-002")
print("D-002 scores", d.get("scores"))
print("D-002 pains len", len(str(d.get("pains") or "")))
