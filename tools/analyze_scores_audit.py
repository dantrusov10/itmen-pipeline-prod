#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only: audit vs current scores — what was filled, what may have been lost."""
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

URL = re.search(
    r'url:\s*"([^"]+)"',
    (Path(__file__).resolve().parent.parent / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

SCORE_WEIGHTS = {
    "loyalty": 0.10, "commit": 0.10, "budget": 0.18, "fit": 0.18, "timing": 0.14,
    "competitive": 0.10, "access": 0.08, "technical": 0.06, "commercial": 0.06,
}

SCORE_AFFECTING_LABELS = {
    "Скоринг", "Статус бюджета", "Статус коммита", "Ключевые боли",
    "Что ищут", "Что есть сейчас", "Почему меняют", "Конкуренты",
    "Риски", "% требований проекта", "% требований пилота",
}


def fetch(path):
    with urllib.request.urlopen(URL + path, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def score_sum(scores_json):
    try:
        sc = json.loads(scores_json) if isinstance(scores_json, str) else scores_json
        return sum(sc.get(k, 0) or 0 for k in SCORE_WEIGHTS)
    except (json.JSONDecodeError, TypeError):
        return 0


def calc_display_score(scores):
    if not scores:
        return None
    vals = list(scores.values())
    if not any(v and v > 0 for v in vals):
        return None
    total = sum((scores.get(k) or 0) * w for k, w in SCORE_WEIGHTS.items())
    return round((total / 5) * 100)


def is_low_scores(scores_json):
    return score_sum(scores_json) <= 2


def is_meaningful_budget(s):
    return s and s not in ("", "Неизвестно")


def is_meaningful_commit(s):
    return s and s not in ("", "none", "Нет подтверждения")


health = fetch("?action=health")
state = fetch("?action=get")["state"]
audit_rows = fetch("?action=auditAll").get("rows") or []

print(f"Audit rows: {len(audit_rows)} (sheet reports {health.get('auditRows')})")
print(f"Deals on server: {len(state.get('deals', []))}")
print(f"savedAt: {state.get('_savedAt')}\n")

deals = {d["id"]: d for d in state["deals"] if d.get("id")}

# Per deal: timeline of score-related audit
by_deal = defaultdict(lambda: {
    "customer": "",
    "owner": "",
    "score_entries": [],
    "other_score_fields": defaultdict(list),
})

for row in audit_rows:
    deal_id = str(row[2] or "")
    label = str(row[6] or "")
    if not deal_id or label == "—":
        continue
    when, old, new = str(row[0]), row[7], row[8]
    rec = by_deal[deal_id]
    rec["customer"] = str(row[3] or rec["customer"])
    rec["owner"] = str(row[5] or rec["owner"])
    if label == "Скоринг":
        rec["score_entries"].append({"when": when, "old": str(old), "new": str(new),
                                     "sum_new": score_sum(str(new)), "sum_old": score_sum(str(old))})
    elif label in SCORE_AFFECTING_LABELS:
        rec["other_score_fields"][label].append({"when": when, "old": str(old)[:80], "new": str(new)[:120]})

# Classify deals
has_audit_scores = []
possibly_lost = []
filled_inputs_current_low = []
recovered_or_ok = []

for deal_id, rec in sorted(by_deal.items(), key=lambda x: -max((e["sum_new"] for e in x[1]["score_entries"]), default=0)):
    if not rec["score_entries"] and not rec["other_score_fields"]:
        continue

    deal = deals.get(deal_id, {})
    cur_scores = deal.get("scores") or {}
    cur_display = calc_display_score(cur_scores)
    cur_sum = sum(cur_scores.values()) if cur_scores else 0

    max_audit_sum = max((e["sum_new"] for e in rec["score_entries"]), default=0)
    last_audit_sum = rec["score_entries"][-1]["sum_new"] if rec["score_entries"] else 0
    best_audit_entry = max(rec["score_entries"], key=lambda e: e["sum_new"]) if rec["score_entries"] else None

    had_wipe = False
    if rec["score_entries"]:
        for i, e in enumerate(rec["score_entries"]):
            if i > 0 and is_low_scores(e["new"]) and not is_low_scores(rec["score_entries"][i - 1]["new"]):
                had_wipe = True
        if is_low_scores(rec["score_entries"][-1]["new"]) and max_audit_sum > 2:
            had_wipe = True

    has_meaningful_inputs = bool(rec["other_score_fields"])
    non_empty_inputs = sum(
        1 for label, evs in rec["other_score_fields"].items()
        for e in evs if e["new"].strip() and e["new"] not in ("{}", "[]", "Неизвестно", "none")
    )

    entry = {
        "id": deal_id,
        "customer": rec["customer"] or deal.get("customer", "?"),
        "owner": rec["owner"] or deal.get("owner", ""),
        "cur_display": cur_display,
        "cur_sum": cur_sum,
        "max_audit_sum": max_audit_sum,
        "best_audit_display": calc_display_score(json.loads(best_audit_entry["new"])) if best_audit_entry and best_audit_entry["sum_new"] > 2 else None,
        "had_score_wipe_in_audit": had_wipe,
        "score_audit_count": len(rec["score_entries"]),
        "input_field_changes": non_empty_inputs,
        "labels_touched": list(rec["other_score_fields"].keys()),
    }

    if rec["score_entries"]:
        has_audit_scores.append(entry)

    if max_audit_sum > cur_sum + 3 or (max_audit_sum > 5 and cur_sum <= 2):
        possibly_lost.append(entry)
    elif cur_display and cur_display >= 20:
        recovered_or_ok.append(entry)
    elif has_meaningful_inputs and cur_sum <= 2:
        filled_inputs_current_low.append(entry)

# Deals with display score >= 20 now (like screenshot)
scored_now = sorted(
    [(d["id"], d.get("customer", ""), d.get("owner", ""), calc_display_score(d.get("scores")))
     for d in state["deals"] if (calc_display_score(d.get("scores")) or 0) >= 20],
    key=lambda x: -(x[3] or 0),
)

print("=" * 60)
print("СЕЙЧАС С БАЛЛОМ > 0 (топ как на скриншоте)")
print("=" * 60)
for did, cust, owner, sc in scored_now[:25]:
    in_audit = did in by_deal and (by_deal[did]["score_entries"] or by_deal[did]["other_score_fields"])
    print(f"  {sc:3}  {did}  {cust[:35]:35}  {owner[:15]:15}  audit={'да' if in_audit else 'НЕТ'}")

print(f"\nВсего с баллом > 0 сейчас: {len(scored_now)}")

print("\n" + "=" * 60)
print("В АУДИТЕ МЕНЯЛСЯ СКОРИНГ (любая сделка)")
print("=" * 60)
for e in sorted(has_audit_scores, key=lambda x: -(x["max_audit_sum"] or 0)):
    flag = "[!]" if e["had_score_wipe_in_audit"] else "   "
    print(f"{flag} {e['id']} {e['customer'][:30]:30} cur={e['cur_display'] or 0:3}  max_audit={e['best_audit_display'] or 0:3}  wipes={e['had_score_wipe_in_audit']}")

print("\n" + "=" * 60)
print("ВЕРОЯТНО ПОТЕРЯНЫ БАЛЛЫ (max в аудите >> сейчас)")
print("=" * 60)
if possibly_lost:
    for e in possibly_lost:
        print(f"  {e['id']} {e['customer'][:32]:32}  сейчас={e['cur_display'] or 0}  было до {e['best_audit_display'] or '?'}  поля: {', '.join(e['labels_touched'][:4])}")
else:
    print("  (нет явных расхождений по сумме скоринга)")

print("\n" + "=" * 60)
print("ЗАПОЛНЯЛИ ПОЛЯ (боли/бюджет/tech), НО СКОРИНГ СЕЙЧАС НИЗКИЙ")
print("=" * 60)
for e in filled_inputs_current_low:
    if e["id"] not in {x["id"] for x in possibly_lost}:
        print(f"  {e['id']} {e['customer'][:32]:32}  cur={e['cur_display'] or 0}  изменений полей={e['input_field_changes']}  {e['labels_touched']}")

print("\n" + "=" * 60)
print("СВОДКА")
print("=" * 60)
audit_any = {k for k, v in by_deal.items() if v["score_entries"] or v["other_score_fields"]}
scored_ids = {x[0] for x in scored_now}
print(f"Сделок с активностью в аудите (скоринг/поля): {len(audit_any)}")
print(f"Сделок с баллом > 0 сейчас: {len(scored_ids)}")
print(f"С баллом сейчас И есть в аудите: {len(scored_ids & audit_any)}")
print(f"С баллом сейчас БЕЗ записей в аудите: {len(scored_ids - audit_any)}")
print(f"В аудите есть, балл сейчас 0/низкий: {len(audit_any - scored_ids)}")
print(f"С откатом скоринга в истории аудита: {sum(1 for e in has_audit_scores if e['had_score_wipe_in_audit'])}")
