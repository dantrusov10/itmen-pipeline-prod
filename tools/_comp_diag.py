import json
import re
import urllib.request

url = open("../js/gas-config.js", encoding="utf-8").read()
m = re.search(r'url:\s*"([^"]+)"', url)
gas = m.group(1)
print("GAS:", gas)
req = urllib.request.Request(gas + "?action=get", headers={"User-Agent": "diag"})
data = json.loads(urllib.request.urlopen(req, timeout=120).read())
deals = (data.get("state") or {}).get("deals", [])
print("total deals", len(deals))

def count_comp(d):
    tr = d.get("techResearch") or {}
    ce = tr.get("competitorEntries") or {}
    entries = [e for seg in ce.values() for e in (seg or []) if e and (e.get("vendor") or e.get("product"))]
    legacy = (d.get("competitors") or "").strip()
    return entries, legacy

vendors = {}
deal_keys = {}
with_any = 0
for d in deals:
    entries, legacy = count_comp(d)
    if entries or legacy:
        with_any += 1
    for e in entries:
        v = (e.get("vendor") or "").strip()
        p = (e.get("product") or "").strip()
        k = f"{v} / {p}" if p else v
        vendors[k] = vendors.get(k, 0) + 1
        deal_keys.setdefault(k, set()).add(d.get("id"))
print("deals with competitorEntries", sum(1 for d in deals if count_comp(d)[0]))
print("deals with legacy competitors", sum(1 for d in deals if count_comp(d)[1]))
print("deals with any", with_any)
print("\nTop vendors by mentions:")
for k, c in sorted(vendors.items(), key=lambda x: -x[1])[:20]:
    print(f"  {c}  {k}  deals={len(deal_keys.get(k, set()))}")
print("\nColibri/GLPI:")
for k in sorted(vendors):
    if "colibri" in k.lower() or "glpi" in k.lower():
        print(f"  {vendors[k]} mentions, {len(deal_keys.get(k, set()))} deals: {sorted(deal_keys.get(k, set()))}")