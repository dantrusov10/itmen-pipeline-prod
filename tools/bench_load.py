#!/usr/bin/env python3
import json, re, time, urllib.request
from pathlib import Path

url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).parent.parent / "js" / "gas-config.js").read_text(encoding="utf-8")).group(1)

for action in ["health", "get", "dynamics"]:
    path = f"?action={action}" + ("&period=week" if action == "dynamics" else "")
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url + path, timeout=180) as r:
            body = r.read()
        dt = time.perf_counter() - t0
        kb = len(body) / 1024
        print(f"{action:10} {dt:6.1f}s  {kb:8.1f} KB")
        if action == "get":
            data = json.loads(body)
            deals = len(data.get("state", {}).get("deals", []))
            print(f"           deals={deals}")
    except Exception as e:
        print(f"{action:10} FAIL {e}")
