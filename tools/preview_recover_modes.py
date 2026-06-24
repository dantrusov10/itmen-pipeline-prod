import json, re, urllib.request, sys
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
for mode in ("lost", "full"):
    p = json.dumps({"action": "recoverFromAudit", "apply": "--apply" in sys.argv, "mode": mode}, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=p, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    d = json.loads(urllib.request.urlopen(req, timeout=300).read().decode())
    print(mode, {k: d.get(k) for k in ("ok","applied","patches","changes","auditRows","error")})
