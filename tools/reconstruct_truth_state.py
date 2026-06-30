#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Восстановление продакшена из аудита.

Рекомендуемый режим (restore_max_audit_state.py):
  По каждой сделке и каждому полю — самое ПОЛНОЕ значение из всего аудита
  (колонки БЫЛО [7] и СТАЛО [8]); при равной полноте — более поздняя метка.
  Учитывает инцидент, фикс 16:00–16:27 МСК (23.06) и все последующие записи.

Устаревший режим (этот файл, --legacy-rules):
  Жёсткие правила по меткам 13:38 / 13:42 / 13:47.
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

INCIDENT_PREFIX = "2026-06-24 10:38:47"
ALLOWED_POST = (
    "2026-06-24 10:42:13",
    "2026-06-24 10:42:51",
    "2026-06-24 10:47:18",
)

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


def fetch(path):
    with urllib.request.urlopen(URL + path, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def post(payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        URL, data=data, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def norm_ts(raw):
    s = str(raw or "").strip().replace("T", " ").replace("Z", "")
    return s[:19]


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


def score_sum_raw(raw):
    try:
        return sum(json.loads(str(raw or "{}")).values())
    except Exception:
        return 0


def pick_incident_value(row, label):
    """Инцидент: по умолчанию БЫЛО. Если СТАЛО полнее (кэш был лучше сервера) — берём СТАЛО."""
    old, new = row[7], row[8]
    old_empty = is_empty_audit(label, old)
    new_empty = is_empty_audit(label, new)
    if label == "Скоринг":
        os, ns = score_sum_raw(old), score_sum_raw(new)
        if ns > os:
            return new
        if os > ns:
            return old
        return old
    if new_empty and not old_empty:
        return old
    if old_empty and not new_empty:
        return new
    return old


def classify_row(ts):
    n = norm_ts(ts)
    if n < INCIDENT_PREFIX:
        return "pre"
    if n.startswith(INCIDENT_PREFIX):
        return "incident"
    for p in ALLOWED_POST:
        if n.startswith(p):
            return "allowed"
    return "skip"


def load_initial_state():
    text = (ROOT / "js" / "initial-data.js").read_text(encoding="utf-8")
    m = re.search(r"window\.ITMEN_INITIAL\s*=\s*(\{[\s\S]*\})\s*;?\s*$", text)
    if not m:
        raise RuntimeError("Cannot parse initial-data.js")
    return json.loads(m.group(1))


def parse_value(label, raw):
    if label == "—" or raw is None:
        return None
    key = LABEL_TO_KEY.get(label)
    if not key:
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
        if s == "":
            return None
        return float(s) if "." in s else int(s)
    if key == "taskDue":
        m = re.search(r"(\d{4}-\d{2}-\d{2})", s)
        return m.group(1) if m else (s[:10] if len(s) >= 10 else s)
    return s


def apply_field(deal, label, raw):
    key = LABEL_TO_KEY.get(label)
    if not key:
        return False
    val = parse_value(label, raw)
    if val is None and key not in ("pains", "riskComment", "taskDue", "partner", "stage", "customer", "owner", "industry"):
        if str(raw or "").strip() == "":
            if key in TECH_KEYS:
                deal.setdefault("techResearch", {})
                if key in ("asIsStack", "changePains", "competitorEntries"):
                    deal["techResearch"][key] = {}
                elif key in ("seekingSegments", "projectTasks"):
                    deal["techResearch"][key] = []
                else:
                    deal["techResearch"][key] = None
            elif key == "riskTypes":
                deal["riskTypes"] = []
                deal["riskType"] = "none"
            elif key == "scores":
                deal["scores"] = {}
            else:
                deal[key] = ""
            deal["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            return True
        return False
    if key in TECH_KEYS:
        deal.setdefault("techResearch", {})
        deal["techResearch"][key] = val
    elif key == "riskTypes":
        deal["riskTypes"] = val or []
        deal["riskType"] = deal["riskTypes"][0] if deal["riskTypes"] else "none"
    elif key == "scores":
        deal["scores"] = val or {}
    else:
        deal[key] = val
    deal["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return True


def fmt_val(deal, label):
    key = LABEL_TO_KEY.get(label)
    if not key:
        return ""
    if key in TECH_KEYS:
        v = (deal.get("techResearch") or {}).get(key)
    elif key == "riskTypes":
        rt = deal.get("riskTypes") or []
        v = ", ".join(x for x in rt if x and x != "none")
    elif key == "scores":
        v = deal.get("scores") or {}
    else:
        v = deal.get(key)
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return str(v)


def norm_cmp(s):
    s = str(s or "").strip()
    try:
        if s.startswith("{") or s.startswith("["):
            return json.dumps(json.loads(s), ensure_ascii=False, sort_keys=True)
    except json.JSONDecodeError:
        pass
    return s


def score_sum(d):
    return sum((d.get("scores") or {}).values())


def rebuild_truth_state(rows, base_state):
    state = deepcopy(base_state)
    deal_map = {d["id"]: d for d in state.get("deals", []) if d.get("id")}
    stats = Counter()
    applied = 0

    sorted_rows = sorted(rows, key=lambda r: norm_ts(r[0]))
    for row in sorted_rows:
        bucket = classify_row(row[0])
        if bucket == "skip":
            stats["skip"] += 1
            continue
        stats[bucket] += 1

        deal_id = str(row[2] or "")
        label = str(row[6] or "")
        if not deal_id or not label or label == "—":
            continue

        if deal_id not in deal_map:
            deal_map[deal_id] = {
                "id": deal_id,
                "customer": str(row[3] or ""),
                "owner": str(row[4] or ""),
                "scores": {},
                "techResearch": {},
            }
            state.setdefault("deals", []).append(deal_map[deal_id])

        if bucket == "incident":
            raw = pick_incident_value(row, label)
        else:
            raw = row[8]
        if apply_field(deal_map[deal_id], label, raw):
            applied += 1

    state["deals"] = [deal_map[d["id"]] for d in sorted(deal_map.values(), key=lambda x: x["id"])]
    return state, stats, applied


def main():
    apply = "--apply" in sys.argv
    rows = fetch("?action=auditAll").get("rows") or []
    current = fetch("?action=get")["state"]
    base = load_initial_state()

    # сохранить список сделок с сервера (218), скелет из initial
    init_by_id = {d["id"]: deepcopy(d) for d in base.get("deals", []) if d.get("id")}
    for d in current.get("deals", []):
        if d.get("id") and d["id"] not in init_by_id:
            init_by_id[d["id"]] = deepcopy(d)
    base["deals"] = list(init_by_id.values())
    base["lists"] = current.get("lists") or base.get("lists")
    base["scoring"] = current.get("scoring") or base.get("scoring")
    base["nextId"] = current.get("nextId") or base.get("nextId")

    truth, stats, applied = rebuild_truth_state(rows, base)
    cur_map = {d["id"]: d for d in current.get("deals", []) if d.get("id")}
    truth_map = {d["id"]: d for d in truth.get("deals", []) if d.get("id")}

    diffs = []
    for did, td in truth_map.items():
        cd = cur_map.get(did)
        if not cd:
            continue
        if norm_cmp(json.dumps(td.get("scores"), sort_keys=True)) != norm_cmp(json.dumps(cd.get("scores"), sort_keys=True)):
            if score_sum(td) > 2 or score_sum(cd) > 2:
                diffs.append((td.get("owner"), did, (td.get("customer") or "")[:28], "scores", score_sum(cd), score_sum(td)))
        if str(td.get("pains") or "").strip() != str(cd.get("pains") or "").strip():
            if str(td.get("pains") or "").strip() or str(cd.get("pains") or "").strip():
                diffs.append((td.get("owner"), did, (td.get("customer") or "")[:28], "pains", "...", "..."))

    by_owner = Counter(o for o, *_ in diffs)
    print("Audit rows:", len(rows))
    print("Buckets:", dict(stats))
    print("Fields applied:", applied)
    print("Deals truth:", len(truth_map), "current:", len(cur_map))
    print("\nDiffs vs current (sample):")
    for owner, cnt in by_owner.most_common():
        print(f"  {owner}: ~{cnt} deal-level changes")
    for d in diffs[:20]:
        print(f"  {d}")

    by_owner_score = Counter()
    for d in truth_map.values():
        if score_sum(d) > 2:
            by_owner_score[d.get("owner")] += 1
    print("\nDeals with meaningful scores in TRUTH state:")
    for o, n in by_owner_score.most_common():
        print(f"  {o}: {n}")

    out = ROOT / "tools" / "truth_state_preview.json"
    out.write_text(json.dumps(truth, ensure_ascii=False)[:800000], encoding="utf-8")
    print(f"\nPreview saved: {out}")

    if not apply:
        print("\nPreview only. Run with --apply to write to server.")
        return

    res = post({
        "action": "save",
        "state": truth,
        "forceFull": True,
        "savedBy": "reconstruct-truth-audit",
        "allowMaintenance": True,
    })
    if res.get("error"):
        print("ERROR:", res["error"])
        sys.exit(1)
    print(f"\nApplied. auditRows={res.get('auditRows')} updatedAt={res.get('updatedAt')}")
    print("Close all pipeline tabs, then Ctrl+Shift+R")


if __name__ == "__main__":
    main()
