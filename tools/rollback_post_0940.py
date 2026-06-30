#!/usr/bin/env python3
"""Откат всех изменений аудита после cutoff (после инцидента 9:40:58 МСК)."""
import json
import re
import sys
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(r'url:\s*"([^"]+)"', (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8")).group(1)
CUTOFF = "2026-06-25T06:40:58.999Z"
RECOVERY_PREFIXES = ("rollback-", "recover", "rollback-post-")

sys.path.insert(0, str(ROOT / "tools"))
from rollback_burst import apply_field, fmt_field, fetch, post, norm  # noqa: E402


def main():
    apply = "--apply" in sys.argv
    rows = fetch("?action=auditAll").get("rows") or []
    after = [
        r for r in rows
        if str(r[0]) > CUTOFF
        and not any(str(r[1] or "").startswith(p) for p in RECOVERY_PREFIXES)
    ]
    field_rows = [r for r in after if str(r[6]) not in ("—", "")]
    print(f"Post-cutoff audit rows: {len(after)}, field rows: {len(field_rows)}")

    state = fetch("?action=get")["state"]
    deals_by_id = {d["id"]: deepcopy(d) for d in state.get("deals", []) if d.get("id")}
    plan = []
    for row in field_rows:
        deal_id, label, old_val = str(row[2]), str(row[6]), row[7]
        deal = deals_by_id.get(deal_id)
        if not deal:
            continue
        cur = fmt_field(deal, label)
        if norm(cur) == norm(old_val):
            continue
        plan.append({"dealId": deal_id, "label": label, "ts": row[0], "from": str(cur)[:60], "to": str(old_val)[:60]})
        apply_field(deal, label, old_val)

    print(f"Revert plan: {len(plan)} fields")
    for p in plan:
        print(f"  {p['ts']} {p['dealId']} {p['label']}")

    if not apply:
        print("Preview only. Use --apply")
        return

    recovered = deepcopy(state)
    recovered["deals"] = list(deals_by_id.values())
    res = post({
        "action": "save",
        "state": recovered,
        "forceFull": True,
        "savedBy": "rollback-post-0940",
        "allowMaintenance": True,
    })
    print("Applied:", res.get("updatedAt"), "auditRows=", res.get("auditRows"))
    if res.get("error"):
        print("ERROR:", res["error"])
        sys.exit(1)


if __name__ == "__main__":
    main()
