import json, re, urllib.request, sys
from pathlib import Path

url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
apply = "--apply" in sys.argv
p = json.dumps({"action": "recoverFromAudit", "apply": apply, "mode": "lost"}, ensure_ascii=False).encode()
req = urllib.request.Request(url, data=p, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
d = json.loads(urllib.request.urlopen(req, timeout=300).read().decode())
out = {k: d[k] for k in ("ok", "applied", "mode", "patches", "changes", "auditRows", "updatedAt") if k in d}
out["plan_count"] = len(d.get("plan") or [])
print(json.dumps(out, ensure_ascii=False))
if d.get("plan"):
    for x in d["plan"][:25]:
        print(x.get("dealId"), x.get("label"), x.get("reason"))
