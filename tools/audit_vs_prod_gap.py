#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare audit last-good values vs prod; find missing data after bug."""
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

EXCLUDE = {"D-019", "D-117", "D-026"}

LABEL_TO_KEY = {
    "Клиент": "customer", "Отрасль": "industry", "Владелец": "owner", "Стадия": "stage",
    "Ожид. сумма": "amount", "Ожид. бюджет": "expectedBudget", "Партнёр": "partner",
    "Скидка партнёру, %": "partnerDiscount", "Скидка клиенту, %": "clientDiscount",
    "Вероятность": "manualProb", "Срок задачи": "taskDue", "Срок бюджета": "budgetPeriod",
    "Статус бюджета": "budgetStatus", "Месяц согласования": "budgetPlannedMonth",
    "Год согласования": "budgetPlannedYear", "Статус коммита": "commitStatus",
    "Ключевые боли": "pains", "Риски": "riskTypes", "Комментарий к риску": "riskComment",
    "Скоринг": "scores", "Что ищут": "seekingSegments", "Другое (что ищут)": "seekingOtherLabel",
    "% требований проекта": "productRequirementsPct", "% требований пилота": "pilotRequirementsPct",
    "Что есть сейчас": "asIsStack", "Почему меняют": "changePains",
    "Конкуренты": "competitorEntries", "Задачи проекта": "projectTasks",
}
TECH_KEYS = {
    "seekingSegments", "seekingOtherLabel", "productRequirementsPct", "pilotRequirementsPct",
    "asIsStack", "changePains", "competitorEntries", "projectTasks",
}
SCORE_WEIGHTS = {
    "loyalty": 0.10, "commit": 0.10, "budget": 0.18, "fit": 0.18, "timing": 0.14,
    "competitive": 0.10, "access": 0.08, "technical": 0.06, "commercial": 0.06,
}


def fetch(path):
    with urllib.request.urlopen(URL + path, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def is_empty(label, raw):
    if raw is None:
        return True
    s = str(raw).strip()
    if not s:
        return True
    if label == "Статус бюджета" and s == "Неизвестно":
        return True
    if label == "Статус коммита" and s in ("none", "Нет подтверждения"):
        return True
    if label == "Срок бюджета" and s == "Не определён":
        return True
    if label == "Ключевые боли" and len(s) < 5:
        return True
    if label == "Скоринг":
        try:
            return sum(json.loads(s).values()) <= 2
        except (json.JSONDecodeError, TypeError):
            return True
    if label in ("Риски", "Что ищут") and len(s) < 2:
        return True
    if label in ("Что есть сейчас", "Почему меняют", "Конкуренты"):
        return s in ("{}", "")
    return False


def fmt(deal, label):
    key = LABEL_TO_KEY.get(label)
    if not key:
        return ""
    if key in TECH_KEYS:
        val = (deal.get("techResearch") or {}).get(key)
    elif key == "riskTypes":
        rt = deal.get("riskTypes") or []
        if not rt and deal.get("riskType") not in (None, "none"):
            rt = [deal["riskType"]]
        val = ", ".join(x for x in rt if x and x != "none")
    elif key == "scores":
        val = deal.get("scores") or {}
    else:
        val = deal.get(key)
    if val is None or val == "":
        return ""
    if isinstance(val, (dict, list)):
        return json.dumps(val, ensure_ascii=False, separators=(",", ":"))
    return str(val)


def calc_score(deal):
    scores = deal.get("scores") or {}
    if not any((scores.get(k) or 0) > 0 for k in SCORE_WEIGHTS):
        return 0
    return round((sum((scores.get(k) or 0) * w for k, w in SCORE_WEIGHTS.items()) / 5) * 100)


def main():
    state = fetch("?action=get")["state"]
    rows = fetch("?action=auditAll").get("rows") or []
    deals = {d["id"]: d for d in state.get("deals", []) if d.get("id")}

    timeline = defaultdict(list)
    for row in rows:
        did, label = str(row[2]), str(row[6])
        if did and label and label != "—":
            timeline[(did, label)].append(row[8])

    empty_gaps = []
    mismatch_gaps = []
    for (did, label), vals in sorted(timeline.items()):
        if did in EXCLUDE:
            continue
        deal = deals.get(did)
        if not deal:
            continue
        last_good = None
        for v in vals:
            if not is_empty(label, v):
                last_good = v
        if last_good is None:
            continue
        cur = fmt(deal, label)
        audit_s = str(last_good)
        if is_empty(label, cur):
            empty_gaps.append({
                "dealId": did, "customer": deal.get("customer", ""),
                "owner": deal.get("owner", ""), "score": calc_score(deal),
                "label": label, "audit": audit_s[:200],
            })
        elif cur != audit_s and label != "Скоринг":
            mismatch_gaps.append({
                "dealId": did, "customer": deal.get("customer", ""),
                "score": calc_score(deal), "label": label,
                "prod": cur[:120], "audit": audit_s[:120],
            })

    def group(items):
        g = defaultdict(list)
        for x in items:
            g[x["dealId"]].append(x)
        return g

    empty_by = group(empty_gaps)
    mismatch_by = group(mismatch_gaps)

    print("=" * 72)
    print("AUDIT vs PROD (excl D-019 Megavolt, D-117 Spartak, D-026 Bashneft)")
    print(f"savedAt: {state.get('_savedAt')}")
    print("=" * 72)

    print(f"\n[A] PROD EMPTY, audit has data: {len(empty_gaps)} fields, {len(empty_by)} deals")
    if empty_by:
        for did in sorted(empty_by):
            items = empty_by[did]
            sc = items[0]["score"]
            tag = " [score>=20, not in recovery list]" if sc >= 20 else ""
            print(f"\n  {did} | {items[0]['customer'][:40]} | score={sc}{tag}")
            for g in items:
                print(f"    - {g['label']}: {g['audit'][:100]}")
    else:
        print("  (none)")

    low_score_empty = [g for g in empty_gaps if g["score"] < 20]
    high_score_empty = [g for g in empty_gaps if g["score"] >= 20]

    print(f"\n[B] Score mismatch (audit max vs prod, excl excluded):")
    score_issues = []
    for did in sorted(deals):
        if did in EXCLUDE:
            continue
        deal = deals[did]
        sc = calc_score(deal)
        audit_scores = []
        for (d, label), vals in timeline.items():
            if d != did or label != "Скоринг":
                continue
            for v in vals:
                if not is_empty("Скоринг", v):
                    try:
                        audit_scores.append(sum(json.loads(str(v)).values()))
                    except (json.JSONDecodeError, TypeError):
                        pass
        if not audit_scores:
            continue
        max_audit = max(audit_scores)
        cur_sum = sum((deal.get("scores") or {}).values())
        if max_audit > cur_sum + 3:
            score_issues.append((did, deal.get("customer", ""), sc, max_audit, cur_sum))

    if score_issues:
        for did, cust, sc, ma, cs in score_issues:
            tag = " [>=20 prod, skip recovery]" if sc >= 20 else ""
            print(f"  {did} {cust[:35]:35} prod={sc} audit_max_sum={ma} prod_sum={cs}{tag}")
    else:
        print("  (none significant)")

    print(f"\n[C] PROD has data but DIFFERS from last audit (non-scoring fields):")
    print(f"    {len(mismatch_gaps)} fields, {len(mismatch_by)} deals (may be intentional edits)")
    notable = [m for m in mismatch_gaps if m["score"] < 20]
    if notable:
        by = group(notable)
        for did in sorted(by)[:10]:
            items = by[did]
            print(f"  {did} | {items[0]['customer'][:35]} | {len(items)} diffs")

    print("\n" + "=" * 72)
    print("SUMMARY")
    print(f"  Remaining empty gaps (all):     {len(empty_gaps)} fields / {len(empty_by)} deals")
    print(f"  Empty gaps score < 20 (action): {len(low_score_empty)} fields")
    print(f"  Empty gaps score >= 20:         {len(high_score_empty)} fields (prod deals, skip)")
    print(f"  Score sum regressions:          {len(score_issues)} deals")
    print("=" * 72)


if __name__ == "__main__":
    main()
