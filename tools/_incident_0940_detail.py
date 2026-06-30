#!/usr/bin/env python3
import json, re, urllib.request
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
rows = json.loads(urllib.request.urlopen(url+"?action=auditAll", timeout=300).read())["rows"]
cutoff = "2026-06-25T06:40:58"
after = [r for r in rows if str(r[0]) > cutoff + ".999Z" or (str(r[0]).startswith(cutoff) is False and str(r[0]) > cutoff)]
# simpler: ts >= cutoff
after = [r for r in rows if str(r[0])[:19] >= cutoff.replace("T"," ") or str(r[0]).startswith(cutoff)]
burst = [r for r in rows if str(r[0]).startswith(cutoff)]
post = [r for r in rows if str(r[0]) > cutoff and not str(r[0]).startswith(cutoff)]
# fix comparison - audit uses ISO Z
def ts(r):
    return str(r[0])
after_all = [r for r in rows if ts(r) > "2026-06-25T06:40:58.999Z"]
print("burst 06:40:58:", len(burst))
print("after cutoff:", len(after_all))
print("post bursts:")
for t,n in Counter(ts(r)[:19] for r in after_all).most_common(15):
    print(f"  {t} -> {n}")
print("\nactors in main burst:")
for a,n in Counter(str(r[1]) for r in burst).most_common(5):
    print(f"  {a}: {n}")
print("\nfield types in burst:")
for a,n in Counter(str(r[6]) for r in burst).most_common(15):
    print(f"  {a}: {n}")
