import json, re, urllib.request
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding='utf-8')).group(1)
rows = [r for r in json.loads(urllib.request.urlopen(url+"?action=auditAll",timeout=300).read())["rows"] if str(r[0]).startswith("2026-06-24T10:54:07")]
print("rows", len(rows))
for r in rows[:8]:
    print(r[2], r[6], str(r[7])[:30], "->", str(r[8])[:30])
