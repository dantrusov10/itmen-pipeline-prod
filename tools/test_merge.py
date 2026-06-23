#!/usr/bin/env python3
"""Simulate stale-tab save: server has newer deal, client sends old copy — merge should keep server."""
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

with urllib.request.urlopen(url + "?action=get", timeout=120) as r:
    server = json.loads(r.read().decode())["state"]

# Pick D-164 or first deal with pains
deal = next((d for d in server["deals"] if d["id"] == "D-164"), server["deals"][0])
deal_id = deal["id"]
server_pains = deal.get("pains", "")
print(f"Testing {deal_id} server pains len={len(server_pains)}")

stale = json.loads(json.dumps(server))
stale_deal = next(d for d in stale["deals"] if d["id"] == deal_id)
stale_deal["pains"] = ""
stale_deal["updatedAt"] = "2020-01-01T00:00:00.000Z"
stale_deal["budgetStatus"] = "Неизвестно"

payload = json.dumps({
    "action": "save",
    "state": stale,
    "editedDealIds": [],
    "deletedDealIds": [],
}, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(url, data=payload, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
with urllib.request.urlopen(req, timeout=180) as r:
    res = json.loads(r.read().decode())

after = next(d for d in res["state"]["deals"] if d["id"] == deal_id)
ok = after.get("pains", "") == server_pains
print("mergeKeptServer:", res.get("mergeKeptServer"))
print("auditRows:", res.get("auditRows"))
print("pains preserved:", ok, f"(len={len(after.get('pains',''))})")
if not ok:
    print("FAIL — stale save overwrote server data")
    sys.exit(1)
print("PASS — merge protected server data from stale tab")
