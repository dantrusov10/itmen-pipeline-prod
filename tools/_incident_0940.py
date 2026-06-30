#!/usr/bin/env python3
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8")).group(1)
rows = json.loads(urllib.request.urlopen(url + "?action=auditAll", timeout=300).read())["rows"]
print("total audit rows:", len(rows))

# User said 9:40:58 MSK -> UTC 06:40:58
# Also check 09:40:58 as UTC just in case
prefixes = [
    "2026-06-25T06:40:58",  # 9:40:58 MSK Jun 25
    "2026-06-25T09:40:58",  # if stored as MSK in sheet
    "2026-06-24T06:40:58",
    "2026-06-24T09:40:58",
]

by_sec = Counter(str(r[0]).replace("T", " ")[:19] for r in rows)
print("\nAll bursts around 06:40-06:45 and 09:40-09:45:")
for t, n in sorted(by_sec.items()):
    if "06:4" in t or "09:4" in t:
        print(f"  {t} -> {n}")

print("\nLast 20 burst timestamps:")
for t, n in by_sec.most_common(20):
    print(f"  {t} -> {n}")

for p in prefixes:
    burst = [r for r in rows if str(r[0]).startswith(p)]
    if burst:
        print(f"\nMATCH prefix {p}: {len(burst)} rows")
        print("  sample:", burst[0][:6])

# Latest rows
print("\nLast 5 audit rows:")
for r in rows[-5:]:
    print(" ", r[0], r[1], r[2], r[6], str(r[7])[:40], "->", str(r[8])[:40])
