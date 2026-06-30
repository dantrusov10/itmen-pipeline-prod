#!/usr/bin/env python3
from copy import deepcopy
import json, re, urllib.request, openpyxl
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT/"js/gas-config.js").read_text(encoding="utf-8")).group(1)
import sys; sys.path.insert(0, str(ROOT/"tools"))
from reconstruct_truth_state import norm_ts
from rollback_burst import apply_field, fetch, fmt_field, norm
from restore_max_audit_state import deal_field_count, score_sum

CUTOFF = "2026-06-25 06:40:58"
rows = fetch("?action=auditAll")["rows"]
rows_before = [r for r in rows if norm_ts(r[0]) < CUTOFF]
current = fetch("?action=get")["state"]
deal_map = {d["id"]: deepcopy(d) for d in current["deals"] if d.get("id")}

for row in sorted(rows_before, key=lambda r: (norm_ts(r[0]), str(r[2]))):
    deal_id, label, new_val = str(row[2] or ""), str(row[6] or ""), row[8]
    if not deal_id or not label or label == "—":
        continue
    if deal_id not in deal_map:
        deal_map[deal_id] = {"id": deal_id, "customer": str(row[3] or ""), "owner": str(row[5] or ""), "techResearch": {}}
    apply_field(deal_map[deal_id], label, new_val)

wb = openpyxl.load_workbook(Path(r"c:\Users\Данила\Downloads\инцидент 9-40-58.xlsx"), read_only=True, data_only=True)
incident_ids = {str(r[2]).strip() for r in wb[wb.sheetnames[0]].iter_rows(min_row=2, values_only=True) if r and r[2]}
cur = {d["id"]: d for d in current["deals"]}

diff = 0
for did in sorted(deal_map):
    if did in incident_ids:
        continue
    c, r = cur.get(did), deal_map[did]
    if norm(json.dumps(c, default=str)) != norm(json.dumps(r, default=str)):
        diff += 1
        print(did, "fc", deal_field_count(c), "->", deal_field_count(r), "sc", score_sum(c), "->", score_sum(r))
print("non-incident deals differing current vs chron replay:", diff)
