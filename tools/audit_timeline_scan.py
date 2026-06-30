#!/usr/bin/env python3
import json, re, urllib.request
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
rows = json.loads(urllib.request.urlopen(url+"?action=auditAll", timeout=300).read())["rows"]
print("total", len(rows))
print("dates", dict(Counter(str(r[0])[:10] for r in rows)))
by_sec = Counter(str(r[0]).replace("T"," ")[:19] for r in rows)
print("\nTop bursts:")
for t, n in by_sec.most_common(15):
    print(f"  {t} -> {n}")
# MSK 16:00-16:27 = UTC 13:00-13:27
win = [r for r in rows if len(str(r[0])) >= 19 and "13:" in str(r[0])[11:14]]
win = [r for r in win if str(r[0])[11:19] >= "13:00:00" and str(r[0])[11:19] <= "13:27:59"]
print(f"\nUTC 13:00-13:27 rows: {len(win)}")
if win:
    for t, n in Counter(str(r[0]).replace("T"," ")[:19] for r in win).most_common(10):
        print(f"  {t} -> {n}")
