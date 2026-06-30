#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Восстановление продакшена: по каждой сделке и каждому полю берём
самое ПОЛНОЕ значение из всего аудита (колонки БЫЛО и СТАЛО).
При равной полноте — более позднюю метку времени.

Учитывает все записи аудита, в т.ч.:
- инцидент 10:38:47 (БЫЛО часто содержит данные до wipe)
- попытки восстановления после инцидента
- фикс 16:00–16:27 МСК = 13:00–13:27 UTC (2026-06-23)

База скелета: текущий сервер (218 сделок).
"""
import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

# reuse field maps from reconstruct_truth_state
sys.path.insert(0, str(ROOT / "tools"))
from reconstruct_truth_state import (  # noqa: E402
    LABEL_TO_KEY,
    TECH_KEYS,
    apply_field,
    fmt_val,
    fetch,
    is_empty_audit,
    load_initial_state,
    norm_cmp,
    norm_ts,
    parse_value,
    post,
    score_sum,
    score_sum_raw,
)


def field_richness(label: str, raw) -> float:
    """Higher = more complete. 0 = treat as empty for recovery."""
    if raw is None:
        return 0.0
    s = str(raw).strip()
    if not s:
        return 0.0
    if is_empty_audit(label, raw):
        return 0.0
    if label == "Скоринг":
        return float(score_sum_raw(raw))
    if label in ("Что есть сейчас", "Почему меняют", "Конкуренты"):
        try:
            obj = json.loads(s)
            if isinstance(obj, dict):
                return float(sum(len(str(v)) for v in obj.values()) + len(obj) * 5)
        except Exception:
            pass
        return float(len(s))
    if label in ("Риски", "Что ищут"):
        return float(len(s))
    if label == "Ключевые боли":
        return float(len(s))
    if label == "Задачи проекта":
        return float(len([x for x in s.split(";") if x.strip()]))
    if label in ("% требований проекта", "% требований пилота", "Вероятность"):
        try:
            return float(s)
        except Exception:
            return 1.0
    return float(len(s))


def collect_best_fields(rows):
    """(deal_id, label) -> (richness, ts, raw, source_col)."""
    best = {}
    for row in rows:
        ts = norm_ts(row[0])
        deal_id = str(row[2] or "")
        label = str(row[6] or "")
        if not deal_id or not label or label == "—":
            continue
        for col_name, raw in (("old", row[7]), ("new", row[8])):
            r = field_richness(label, raw)
            if r <= 0:
                continue
            key = (deal_id, label)
            cur = best.get(key)
            if cur is None or r > cur[0] or (r == cur[0] and ts >= cur[1]):
                best[key] = (r, ts, raw, col_name)
    return best


def rebuild_max_state(rows, base_state):
    state = deepcopy(base_state)
    deal_map = {d["id"]: d for d in state.get("deals", []) if d.get("id")}
    best = collect_best_fields(rows)
    applied = 0
    sources = Counter()

    for (deal_id, label), (rich, ts, raw, src) in best.items():
        if deal_id not in deal_map:
            deal_map[deal_id] = {
                "id": deal_id,
                "customer": "",
                "owner": "",
                "scores": {},
                "techResearch": {},
            }
            state.setdefault("deals", []).append(deal_map[deal_id])
        if apply_field(deal_map[deal_id], label, raw):
            applied += 1
            sources[src] += 1

    state["deals"] = sorted(deal_map.values(), key=lambda d: d["id"])
    return state, best, applied, sources


def deal_field_count(d):
    """Rough count of non-empty passport fields on deal."""
    n = 0
    for label in LABEL_TO_KEY:
        v = fmt_val(d, label)
        if v and not is_empty_audit(label, v):
            n += 1
    return n


def main():
    apply = "--apply" in sys.argv
    rows = fetch("?action=auditAll").get("rows") or []
    current = fetch("?action=get")["state"]
    base = deepcopy(current)
    base["lists"] = current.get("lists") or base.get("lists")
    base["scoring"] = current.get("scoring") or base.get("scoring")

    restored, best, applied, sources = rebuild_max_state(rows, base)
    cur_map = {d["id"]: d for d in current.get("deals", []) if d.get("id")}
    res_map = {d["id"]: d for d in restored.get("deals", []) if d.get("id")}

    changed_deals = []
    for did, rd in res_map.items():
        cd = cur_map.get(did)
        if not cd:
            continue
        cur_fc = deal_field_count(cd)
        res_fc = deal_field_count(rd)
        cur_sc = score_sum(cd)
        res_sc = score_sum(rd)
        if res_fc > cur_fc or res_sc > cur_sc or norm_cmp(json.dumps(rd.get("scores"))) != norm_cmp(json.dumps(cd.get("scores"))):
            changed_deals.append((did, cd.get("owner"), (cd.get("customer") or "")[:35], cur_fc, res_fc, cur_sc, res_sc))

    by_owner = Counter(x[1] for x in changed_deals)
    print("Audit rows:", len(rows))
    print("Best field entries:", len(best))
    print("Fields applied to state:", applied)
    print("Source columns:", dict(sources))
    print(f"\nDeals with improvements: {len(changed_deals)}")
    for o, n in by_owner.most_common():
        print(f"  {o}: {n}")

    print("\nSample improvements (first 25):")
    for x in sorted(changed_deals, key=lambda t: -(t[5] - t[4]))[:25]:
        print(f"  {x[0]} {x[2]} fields {x[3]}->{x[4]} score {x[5]}->{x[6]}")

    # June 23 fix window stats
    fix_rows = [r for r in rows if str(r[0]).startswith("2026-06-23") and "13:" in str(r[0])[11:14]]
    fix_rows = [r for r in fix_rows if "13:00" <= str(r[0])[11:19] <= "13:27:59"]
    fix_best = collect_best_fields(fix_rows)
    print(f"\n2026-06-23 16:00-16:27 MSK window: {len(fix_rows)} audit rows, {len(fix_best)} best fields contributed")

    by_owner_score = Counter()
    for d in res_map.values():
        if score_sum(d) > 2:
            by_owner_score[d.get("owner")] += 1
    print("\nDeals with meaningful scores after MAX restore:")
    for o, n in by_owner_score.most_common():
        print(f"  {o}: {n}")

    out = ROOT / "tools" / "max_audit_state_preview.json"
    out.write_text(json.dumps(restored, ensure_ascii=False), encoding="utf-8")
    print(f"\nPreview: {out} ({out.stat().st_size // 1024} KB)")

    plan_path = ROOT / "tools" / "max_audit_restore_plan.json"
    plan = [
        {"deal_id": k[0], "label": k[1], "richness": v[0], "ts": v[1], "source": v[3]}
        for k, v in sorted(best.items(), key=lambda x: (-x[1][0], x[0][0]))
    ]
    plan_path.write_text(json.dumps(plan[:500], ensure_ascii=False, indent=2), encoding="utf-8")

    if not apply:
        print("\nPreview only. Run with --apply to write to server.")
        return

    res = post({
        "action": "save",
        "state": restored,
        "forceFull": True,
        "savedBy": "restore-max-audit-state",
        "allowMaintenance": True,
    })
    if res.get("error"):
        print("ERROR:", res["error"])
        sys.exit(1)
    print(f"\nApplied. auditRows={res.get('auditRows')} updatedAt={res.get('updatedAt')}")
    print("Close all pipeline tabs, then Ctrl+Shift+R")


if __name__ == "__main__":
    main()
