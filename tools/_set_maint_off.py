import json, re, urllib.request
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', Path(__file__).resolve().parent.parent.joinpath("js/gas-config.js").read_text(encoding="utf-8")).group(1)
data = json.dumps({"action": "setMaintenance", "on": False}, ensure_ascii=False).encode()
req = urllib.request.Request(url, data=data, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
print(json.loads(urllib.request.urlopen(req, timeout=60).read()))
