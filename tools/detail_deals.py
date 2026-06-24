import json, re, urllib.request
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
s = json.loads(urllib.request.urlopen(url+"?action=get", timeout=120).read())["state"]
rows = json.loads(urllib.request.urlopen(url+"?action=auditAll", timeout=120).read()).get("rows", [])
for i in ["D-026","D-122","D-217","D-206","D-196","D-218"]:
    d = next(x for x in s["deals"] if x["id"]==i)
    ar = [r for r in rows if r[2]==i]
    print(i, (d.get("customer") or "")[:28])
    print("  scores:", d.get("scores"), "pains:", len(d.get("pains") or ""), "budget:", d.get("budgetStatus"))
    print("  audit rows:", len(ar), "labels:", sorted(set(r[6] for r in ar)))
