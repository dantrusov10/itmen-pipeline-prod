import re, json, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
t = (ROOT / "js" / "initial-data.js").read_text(encoding="utf-8")
state = json.loads(re.search(r"window\.ITMEN_INITIAL\s*=\s*(\{[\s\S]*\});?\s*$", t).group(1))
cfg = (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8")
url = re.search(r'url:\s*"([^"]+)"', cfg).group(1)
payload = json.dumps({"action": "save", "state": state}, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(url, data=payload, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
with urllib.request.urlopen(req, timeout=180) as r:
    print(r.read().decode("utf-8"))
