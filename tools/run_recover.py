#!/usr/bin/env python3
"""Preview or apply audit recovery via GAS API. Run after deploying updated Code.gs."""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
url = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

apply = "--apply" in sys.argv
payload = json.dumps({"action": "recoverFromAudit", "apply": apply}, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(
    url,
    data=payload,
    headers={"Content-Type": "text/plain;charset=utf-8"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=180) as r:
    data = json.loads(r.read().decode("utf-8"))

if data.get("error"):
    print("ERROR:", data["error"])
    sys.exit(1)

print(json.dumps(data, ensure_ascii=False, indent=2))
if apply:
    print("\nRecovery applied. Refresh the pipeline page (Ctrl+F5).")
else:
    print("\nPreview only. To apply: python tools/run_recover.py --apply")
