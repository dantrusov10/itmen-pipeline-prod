#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Диагностика полноты паспортов по менеджерам + сравнение с аудитом до wipe."""
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

Wipe_PREFIX = "2026-06-24T10:38:47"

LABEL_TO_KEY = {
    "Клиент": "customer", "Отрасль": "industry", "Владелец": "owner", "Стадия": "stage",
    "Ожид. сумма": "amount", "Ожид. бюджет": "expectedBudget", "Партнёр": "partner",
    "Скидка партнёру, %": "partnerDiscount", "Вероятность": "manualProb", "Срок задачи": "taskDue",
    "Срок бюджета": "budgetPeriod", "Статус бюджета": "budgetStatus",
    "Статус коммита": "commitStatus", "Ключевые боли": "pains", "Риски": "riskTypes",
    "Скоринг": "scores", "Что ищут": "seekingSegments",
    "% требований проекта": "productRequirementsPct", "% требований пилота": "pilotRequirementsPct",
    "Что есть сейчас": "asIsStack", "Почему меняют": "changePains",
    "Конкуренты": "competitorEntries", "Задачи проекта": "projectTasks",
}
TECH = {"seekingSegments", "productRequirementsPct", "pilotRequirementsPct", "asIsStack", "changePains", "competitorEntries", "projectTasks"}
NO_PARTNER = {"", "нет партнёра", "без партнёра", "нет", "—", "-"}


def fetch(q):
    with urllib.request.urlopen(URL + q, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def post(payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(URL, data=data, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def has_partner(p):
    p = str(p or "").strip().lower()
    return bool(p and p not in NO_PARTNER)


def eval_blocks(d):
    tr = d.get("techResearch") or {}
    risks = d.get("riskTypes") or []
    pains = str(d.get("pains") or "").strip()

    basic_ok = all([
        d.get("customer", "").strip(),
        d.get("industry", "").strip() not in ("", "Не определена"),
        d.get("owner", "").strip() not in ("", "Не назначен"),
        d.get("stage", "").strip(),
        float(d.get("amount") or 0) > 0,
        float(d.get("expectedBudget") or 0) > 0,
        str(d.get("partner", "")).strip(),
        not has_partner(d.get("partner")) or d.get("partnerDiscount") not in (None, ""),
        str(d.get("taskDue") or "").strip(),
    ])
    minimal_ok = all([
        float(d.get("manualProb") or 0) > 0,
        d.get("budgetPeriod", "").strip() not in ("", "Не определён"),
        d.get("budgetStatus", "").strip() not in ("", "Неизвестно"),
        d.get("commitStatus") not in (None, "", "none"),
        pains or d.get("hasPains"),
        risks or str(d.get("riskComment") or "").strip(),
    ])
    stack = tr.get("asIsStack") or {}
    has_asis = any(
        (isinstance(v, str) and v.strip()) or (isinstance(v, dict) and (v.get("vendor") or v.get("product") or v.get("custom")))
        for v in stack.values()
    )
    pains_chg = tr.get("changePains") or {}
    has_chg = any(str(v or "").strip() for v in pains_chg.values())
    entries = [e for es in (tr.get("competitorEntries") or {}).values() for e in (es or []) if e]
    has_comp = any((e.get("vendor") or "").strip() or (e.get("product") or "").strip() for e in entries)
    technical_ok = all([
        (tr.get("seekingSegments") or []),
        has_asis,
        has_chg,
        [t for t in (tr.get("projectTasks") or []) if str(t or "").strip()],
    ])
    competitive_ok = has_comp
    requirements_ok = (tr.get("productRequirementsPct") not in (None, "")) or (tr.get("pilotRequirementsPct") not in (None, ""))
    all_ok = basic_ok and minimal_ok and technical_ok and competitive_ok and requirements_ok
    return {
        "basic": basic_ok, "minimal": minimal_ok, "technical": technical_ok,
        "competitive": competitive_ok, "requirements": requirements_ok, "all": all_ok,
    }


def is_empty_audit(label, raw):
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
        except Exception:
            return True
    if label in ("Риски", "Что ищут") and len(s) < 2:
        return True
    if label in ("Что есть сейчас", "Почему меняют", "Конкуренты") and s in ("{}", ""):
        return True
    return False


def main():
    state = fetch("?action=get")["state"]
    deals = state.get("deals") or []
    print(f"Server deals: {len(deals)}, savedAt: {state.get('_savedAt')}\n")

    by_owner = defaultdict(list)
    for d in deals:
        by_owner[d.get("owner") or "Не назначен"].append(d)

    print("=== Текущая полнота по менеджерам (все 5 блоков) ===")
    for owner, ds in sorted(by_owner.items(), key=lambda x: -len(x[1])):
        blocks = defaultdict(int)
        complete = 0
        has_score = 0
        has_pains = 0
        for d in ds:
            eb = eval_blocks(d)
            if eb["all"]:
                complete += 1
            for k, v in eb.items():
                if k != "all" and v:
                    blocks[k] += 1
            sc = d.get("scores") or {}
            if sum(sc.values()) > 2:
                has_score += 1
            if str(d.get("pains") or "").strip():
                has_pains += 1
        n = len(ds)
        print(f"\n{owner} — {n} сделок, полных: {complete} ({round(100*complete/n) if n else 0}%)")
        print(f"  со скорингом: {has_score} ({round(100*has_score/n) if n else 0}%)")
        print(f"  с болями: {has_pains} ({round(100*has_pains/n) if n else 0}%)")
        for k in ("basic", "minimal", "technical", "competitive", "requirements"):
            print(f"  {k}: {blocks[k]} ({round(100*blocks[k]/n) if n else 0}%)")

    print("\n=== Аудит: что ещё можно восстановить (до wipe) ===")
    rows = fetch("?action=auditAll").get("rows") or []
    pre = [r for r in rows if str(r[0] or "") < Wipe_PREFIX]
    wipe = [r for r in rows if str(r[0] or "").startswith(Wipe_PREFIX)]

    timeline = defaultdict(list)
    for row in pre:
        deal_id, label = str(row[2]), str(row[6])
        if deal_id and label and label != "—":
            timeline[(deal_id, label)].append(row[8])

    deal_map = {d["id"]: d for d in deals}
    recoverable = []
    for (deal_id, label), vals in timeline.items():
        last_good = None
        for v in vals:
            if not is_empty_audit(label, v):
                last_good = v
        if last_good is None:
            continue
        deal = deal_map.get(deal_id)
        if not deal:
            continue
        # current empty-ish but audit had data
        key = LABEL_TO_KEY.get(label)
        if not key:
            continue
        if key in TECH:
            cur = (deal.get("techResearch") or {}).get(key)
        elif key == "scores":
            cur = deal.get("scores")
        elif key == "riskTypes":
            cur = ", ".join(deal.get("riskTypes") or [])
        else:
            cur = deal.get(key)
        cur_empty = is_empty_audit(label, json.dumps(cur, ensure_ascii=False) if isinstance(cur, (dict, list)) else cur)
        good_empty = is_empty_audit(label, last_good)
        if not good_empty and cur_empty:
            recoverable.append((deal.get("owner"), deal_id, deal.get("customer", "")[:35], label))

    by_owner_rec = defaultdict(int)
    for owner, *_ in recoverable:
        by_owner_rec[owner or "?"] += 1

    print(f"Полей для восстановления из аудита (пусто сейчас, было заполнено): {len(recoverable)}")
    for owner, cnt in sorted(by_owner_rec.items(), key=lambda x: -x[1]):
        print(f"  {owner}: {cnt} полей")

    print(f"\nWipe batch rows: {len(wipe)}")
    print("\nПримеры (первые 15):")
    for r in recoverable[:15]:
        print(f"  {r[0]} | {r[1]} | {r[2]} | {r[3]}")

    # server recover preview
    try:
        prev = post({"action": "recoverFromAudit", "apply": False, "mode": "lost"})
        print(f"\nGAS recoverFromAudit (lost): patches={prev.get('patches')} changes={prev.get('changes')}")
    except Exception as e:
        print(f"\nGAS recover preview failed: {e}")


if __name__ == "__main__":
    main()
