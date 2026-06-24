import json, re, urllib.request
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding='utf-8')).group(1)
rows = [r for r in json.loads(urllib.request.urlopen(url+"?action=auditAll",timeout=300).read())["rows"] if str(r[2])=="D-007" and str(r[6])=="Скоринг"]
print("score rows", len(rows))
for r in rows:
    ts = str(r[0])[:19]
    old = str(r[7])[:80]
    new = str(r[8])[:80]
    print(ts, "old:", old, "| new:", new)
