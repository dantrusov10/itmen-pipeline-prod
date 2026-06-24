#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Восстановление: последнее непустое значение каждого поля из аудита ДО инцидента 13:38:47.
Шире, чем recoverFromAudit lost — покрывает поля, которые пустые сейчас, но были заполнены ранее.
"""
import json
import re
import sys
import urllib.request
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

CUTOFF = "2026-06-24T10:38:47"  # до первого массового wipe

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


def fetch(q):
    with urllib.request.urlopen(URL + q, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def post(payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(URL, data=data, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


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


def parse_value(label, raw):
    key = LABEL_TO_KEY.get(label)
    if key is None:
        return None
    if raw is None:
        return None
    s = str(raw).strip()
    if key == "scores":
        return json.loads(s)
    if key in ("asIsStack", "changePains", "competitorEntries"):
        if not s or s == "{}":
            return {} if key != "competitorEntries" else {}
        return json.loads(s)
    if key in ("riskTypes", "seekingSegments"):
        return [x.strip() for x in s.split(",") if x.strip()] if s else []
    if key == "projectTasks":
        return [x.strip() for x in s.split(";") if x.strip()] if s else []
    if key in ("amount", "expectedBudget", "manualProb", "partnerDiscount", "clientDiscount",
               "budgetPlannedMonth", "budgetPlannedYear", "productRequirementsPct", "pilotRequirementsPct"):
        if not s:
            return None
        return float(s) if "." in s else int(s)
    if key == "taskDue":
        m = re.search(r"(\d{4}-\d{2}-\d{2})", s)
        return m.group(1) if m else (s[:10] if len(s) >= 10 else s)
    return s


def fmt_current(deal, label):
    key = LABEL_TO_KEY.get(label)
    if not key:
        return ""
    if key in TECH_KEYS:
        val = (deal.get("techResearch") or {}).get(key)
    elif key == "riskTypes":
        rt = deal.get("riskTypes") or []
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


def apply_field(deal, label, raw):
    key = LABEL_TO_KEY.get(label)
    if not key:
        return False
    val = parse_value(label, raw)
    if key in TECH_KEYS:
        deal.setdefault("techResearch", {})
        deal["techResearch"][key] = val
    elif key == "riskTypes":
        deal["riskTypes"] = val or []
        deal["riskType"] = deal["riskTypes"][0] if deal["riskTypes"] else "none"
    else:
        deal[key] = val
    deal["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return True


def norm(s):
    s = str(s or "").strip()
    try:
        if s.startswith("{") or s.startswith("["):
            return json.dumps(json.loads(s), ensure_ascii=False, sort_keys=True)
    except json.JSONDecodeError:
        pass
    return s


def main():
    apply = "--apply" in sys.argv
    rows = fetch("?action=auditAll").get("rows") or []
    pre = [r for r in rows if str(r[0] or "") < CUTOFF]

    timeline = defaultdict(list)
    for row in pre:
        deal_id, label, val, ts = str(row[2]), str(row[6]), row[8], str(row[0])
        if deal_id and label and label != "—":
            timeline[(deal_id, label)].append((ts, val))

    state = fetch("?action=get")["state"]
    deals_by_id = {d["id"]: deepcopy(d) for d in state.get("deals", []) if d.get("id")}

    plan = []
    by_owner = defaultdict(int)
    for (deal_id, label), entries in timeline.items():
        entries.sort(key=lambda x: x[0])
        last_good = None
        for _, v in entries:
            if not is_empty_audit(label, v):
                last_good = v
        if last_good is None:
            continue
        deal = deals_by_id.get(deal_id)
        if not deal:
            continue
        cur = fmt_current(deal, label)
        if not is_empty_audit(label, cur):
            continue
        if norm(cur) == norm(last_good):
            continue
        plan.append({
            "dealId": deal_id,
            "owner": deal.get("owner"),
            "customer": (deal.get("customer") or "")[:40],
            "label": label,
            "restore": str(last_good)[:100],
        })
        apply_field(deal, label, last_good)
        by_owner[deal.get("owner") or "?"] += 1

    print(f"Pre-wipe audit rows: {len(pre)}")
    print(f"Recovery plan (empty now, had value before {CUTOFF}): {len(plan)}")
    for owner, n in sorted(by_owner.items(), key=lambda x: -x[1]):
        print(f"  {owner}: {n}")
    for p in plan[:20]:
        print(f"  {p['dealId']} | {p['owner']} | {p['label']}")

    out = ROOT / "tools" / "recover_prewipe_plan.json"
    out.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")

    if not apply:
        print("\nPreview only. Run with --apply")
        return

    recovered = deepcopy(state)
    recovered["deals"] = list(deals_by_id.values())
    res = post({
        "action": "save",
        "state": recovered,
        "forceFull": True,
        "savedBy": "recover-prewipe",
        "allowMaintenance": True,
    })
    if res.get("error"):
        print("ERROR:", res["error"])
        sys.exit(1)
    print(f"Applied {len(plan)} fields. auditRows={res.get('auditRows')}")


if __name__ == "__main__":
    main()
