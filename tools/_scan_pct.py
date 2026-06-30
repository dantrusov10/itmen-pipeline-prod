import json, re, urllib.request
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', Path(__file__).resolve().parent.parent.joinpath("js/gas-config.js").read_text(encoding="utf-8")).group(1)
deals = json.loads(urllib.request.urlopen(url + "?action=get", timeout=120).read())["state"]["deals"]
bad = []
for d in deals:
    tr = d.get("techResearch") or {}
    for k in ("productRequirementsPct", "pilotRequirementsPct"):
        v = tr.get(k)
        if v is not None:
            try:
                fv = float(v)
                if fv > 100 or fv < 0:
                    bad.append((d["id"], k, fv))
            except (TypeError, ValueError):
                bad.append((d["id"], k, repr(v), type(v).__name__))
pcts = [d.get("techResearch", {}).get("productRequirementsPct") for d in deals]
pcts_nn = [x for x in pcts if x is not None]
print("product pcts count", len(pcts_nn))
try:
    s = sum(float(x) for x in pcts_nn)
    print("avg product", round(s / len(pcts_nn), 2) if pcts_nn else None)
except Exception as e:
    print("sum error", e)
    for d in deals:
        v = d.get("techResearch", {}).get("productRequirementsPct")
        if v is not None:
            print(d["id"], type(v).__name__, repr(v)[:80])
print("bad values", len(bad))
for x in bad[:25]:
    print(" ", x)
