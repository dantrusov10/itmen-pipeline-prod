#!/usr/bin/env python3
"""Export CRM presale deals + Kaiten board cards to one xlsx (2 sheets)."""
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    from openpyxl import Workbook
except ImportError:
    print("openpyxl required: pip install openpyxl", file=sys.stderr)
    sys.exit(1)


def run_export_on_prod():
    cmd = "cd /opt/itmen-pipeline && node scripts/run-kaiten-export.js /tmp"
    out = subprocess.check_output(["ssh", "newlevel-prod", cmd], text=True, encoding="utf-8", errors="replace")
    return json.loads(out)


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads"
    out_dir.mkdir(parents=True, exist_ok=True)
    xlsx_path = out_dir / "kaiten-match-export.xlsx"

    data = run_export_on_prod()
    crm_path = data["crmPath"]
    kaiten_path = data["kaitenPath"]

    def read_csv_remote(path):
        raw = subprocess.check_output(["ssh", "newlevel-prod", f"cat {path}"], text=True, encoding="utf-8-sig", errors="replace")
        lines = raw.strip().split("\n")
        if not lines:
            return [], []
        headers = [h.strip() for h in lines[0].split(",")]
        rows = []
        for line in lines[1:]:
            if not line.strip():
                continue
            parts = []
            cur = ""
            in_q = False
            for ch in line:
                if ch == '"':
                    in_q = not in_q
                    continue
                if ch == "," and not in_q:
                    parts.append(cur)
                    cur = ""
                else:
                    cur += ch
            parts.append(cur)
            rows.append(dict(zip(headers, parts)))
        return headers, rows

    crm_headers, crm_rows = read_csv_remote(crm_path)
    kaiten_headers, kaiten_rows = read_csv_remote(kaiten_path)

    wb = Workbook()
    ws1 = wb.active
    ws1.title = "CRM пре-сейл"
    ws1.append(crm_headers)
    for row in crm_rows:
        ws1.append([row.get(h, "") for h in crm_headers])

    ws2 = wb.create_sheet("Kaiten")
    ws2.append(kaiten_headers)
    for row in kaiten_rows:
        ws2.append([row.get(h, "") for h in kaiten_headers])

    wb.save(xlsx_path)
    print(json.dumps({
        "ok": True,
        "path": str(xlsx_path),
        "crmCount": len(crm_rows),
        "kaitenCount": len(kaiten_rows),
        "linkedCount": data.get("linkedCount"),
        "linked": data.get("linked"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
