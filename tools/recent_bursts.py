import json, re, urllib.request
from collections import Counter
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
rows = json.loads(urllib.request.urlopen(url+"?action=auditAll", timeout=300).read())["rows"]
by_sec = Counter(str(r[0])[:19] for r in rows)
print("Recent bursts:")
for k,v in sorted(by_sec.items(), key=lambda x: x[0])[-8:]:
    print(v, k)
