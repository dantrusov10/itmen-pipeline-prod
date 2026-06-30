#!/usr/bin/env python3
import json, re, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT/"js/gas-config.js").read_text(encoding="utf-8")).group(1)

# health + audit count
for action in ["health", "get"]:
    try:
        if action == "health":
            d = json.loads(urllib.request.urlopen(url+"?action=health", timeout=60).read())
        else:
            d = json.loads(urllib.request.urlopen(url+"?action=get", timeout=120).read())
            d = {"deals": len(d.get("state",{}).get("deals",[])), "savedAt": d.get("state",{}).get("_savedAt")}
        print(action, d)
    except Exception as e:
        print(action, "ERR", e)

rows = json.loads(urllib.request.urlopen(url+"?action=auditAll", timeout=300).read()).get("rows", [])
print("audit rows", len(rows))
from collections import Counter
print("top timestamps:", Counter(str(r[0])[:19] for r in rows).most_common(10))
