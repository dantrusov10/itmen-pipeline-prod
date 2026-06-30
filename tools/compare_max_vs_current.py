#!/usr/bin/env python3
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from reconstruct_truth_state import norm_cmp, score_sum, fmt_val, LABEL_TO_KEY, is_empty_audit
import urllib.request, re

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding="utf-8")).group(1)
current = json.loads(urllib.request.urlopen(URL+"?action=get",timeout=300).read())["state"]
restored = json.loads((ROOT/"tools"/"max_audit_state_preview.json").read_text(encoding="utf-8"))
norm = json.loads((ROOT/"tools"/"incident_normalize_report.json").read_text(encoding="utf-8"))

cur = {d["id"]: d for d in current["deals"]}
res = {d["id"]: d for d in restored["deals"]}

def field_diffs(did):
    diffs = []
    for label in LABEL_TO_KEY:
        a = fmt_val(cur[did], label)
        b = fmt_val(res[did], label)
        if norm_cmp(a) != norm_cmp(b):
            diffs.append(label)
    return diffs

all_diff = []
for did in cur:
    if did not in res:
        continue
    d = field_diffs(did)
    if d:
        all_diff.append((did, cur[did].get("owner"), cur[did].get("customer","")[:32], len(d), score_sum(cur[did]), score_sum(res[did]), d[:5]))

print(f"Deals with ANY field diff vs max-audit: {len(all_diff)}")
for x in sorted(all_diff, key=lambda t: -t[3])[:40]:
    print(f"  {x[0]} {x[2]} | {x[3]} fields | sc {x[4]}->{x[5]} | {x[6]}")

# incident lists
for mgr in norm:
    ids = set()
    for k in ("need_restore","incident_only_not_in_prefilled","prefilled_not_affected"):
        ids |= {x["id"] for x in norm[mgr].get(k,[])}
    print(f"\n=== {norm[mgr]['owner']} incident-related ({len(ids)}) ===")
    for did in sorted(ids, key=lambda x: int(x.split("-")[1])):
        d = field_diffs(did) if did in cur else []
        print(f"  {did} {(cur.get(did,{}).get('customer') or '')[:30]} sc {score_sum(cur.get(did,{}))}->{score_sum(res.get(did,{}))} diffs={len(d)}")
