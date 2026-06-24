import json, re, urllib.request
from pathlib import Path
url = re.search(r'url:\s*"([^"]+)"', (Path(__file__).resolve().parent.parent/"js"/"gas-config.js").read_text(encoding='utf-8')).group(1)
rows = json.loads(urllib.request.urlopen(url+"?action=auditAll",timeout=300).read())["rows"]
for did in ["D-002", "D-007", "D-013", "D-019", "D-026"]:
    rs = [r for r in rows if str(r[2]) == did and str(r[6]) == "Скоринг"]
    print(f"\n{did} all score rows ({len(rs)}):")
    for r in rs:
        ts = str(r[0])[:19]
        print(f"  {ts} old_sum~{sum(json.loads(str(r[7] or '{}')).values()) if str(r[7]).startswith('{') else 0} new_sum~{sum(json.loads(str(r[8] or '{}')).values()) if str(r[8]).startswith('{') else 0}")
