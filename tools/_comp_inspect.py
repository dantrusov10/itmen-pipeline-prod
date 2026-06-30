import json
import re
import urllib.request

gas = re.search(r'url:\s*"([^"]+)"', open("../js/gas-config.js", encoding="utf-8").read()).group(1)
data = json.loads(urllib.request.urlopen(gas + "?action=get", timeout=120).read())
deals = (data.get("state") or {}).get("deals", [])
for did in ["D-217", "D-063", "D-023", "D-066"]:
    d = next(x for x in deals if x.get("id") == did)
    ce = (d.get("techResearch") or {}).get("competitorEntries") or {}
    print("===", did, d.get("customer"))
    for seg, arr in ce.items():
        for e in arr:
            print(" ", seg, "|", e.get("vendor"), "|", e.get("product"), "|", e.get("catalogKey"), "|", e.get("status"))
