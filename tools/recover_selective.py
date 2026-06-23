#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Вариант 4: preview + подтверждение
Вариант 1: только пустые поля, сделки с баллом >= 20 не трогаем, D-026 исключён

Usage:
  python tools/recover_selective.py              # preview → tools/recover_preview.json
  python tools/recover_selective.py --apply      # применить весь план (после ok)
  python tools/recover_selective.py --apply --approved tools/recover_approved.json
"""
import json
import re
import sys
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

EXCLUDE_DEALS = {"D-026"}
SCORE_SKIP = 20
PREVIEW_FILE = ROOT / "tools" / "recover_preview.json"
APPROVED_FILE = ROOT / "tools" / "recover_approved.json"

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


def fetch_get(path):
    with urllib.request.urlopen(URL + path, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def post(payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        URL, data=data, headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def calc_display_score(deal):
    scores = deal.get("scores") or {}
    if not any((scores.get(k) or 0) > 0 for k in SCORE_WEIGHTS):
        return 0
    wsum = sum((scores.get(k) or 0) * w for k, w in SCORE_WEIGHTS.items())
    return round((wsum / 5) * 100)


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
        except (json.JSONDecodeError, TypeError):
            return True
    if label in ("Риски", "Что ищут") and len(s) < 2:
        return True
    if label in ("Что есть сейчас", "Почему меняют", "Конкуренты"):
        return s in ("{}", "")
    return False


def fmt_current(deal, label):
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


def parse_value(label, raw):
    key = LABEL_TO_KEY.get(label)
    if key is None or raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if key == "scores":
        return json.loads(s)
    if key in ("asIsStack", "changePains", "competitorEntries"):
        return json.loads(s)
    if key in ("riskTypes", "seekingSegments"):
        return [x.strip() for x in s.split(",") if x.strip()]
    if key == "projectTasks":
        return [x.strip() for x in s.split(";") if x.strip()]
    if key in ("amount", "expectedBudget", "manualProb", "partnerDiscount", "clientDiscount",
               "budgetPlannedMonth", "budgetPlannedYear", "productRequirementsPct", "pilotRequirementsPct"):
        return float(s) if "." in s else int(s)
    if key == "taskDue":
        m = re.search(r"(\d{4}-\d{2}-\d{2})", s)
        if m:
            return m.group(1)
        if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            return s
        return s[:10] if len(s) >= 10 else s
    return s


def apply_field(deal, label, raw):
    key = LABEL_TO_KEY.get(label)
    if not key:
        return False
    val = parse_value(label, raw)
    if val is None and key not in ("pains", "riskComment", "taskDue"):
        return False
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


def build_plan(state, audit_rows):
    deals = {d["id"]: d for d in state.get("deals", []) if d.get("id")}
    timeline = {}
    for row in audit_rows:
        deal_id, label = str(row[2]), str(row[6])
        if not deal_id or not label or label == "—":
            continue
        timeline.setdefault((deal_id, label), []).append(row[8])

    plan = []
    for (deal_id, label), vals in sorted(timeline.items()):
        if deal_id in EXCLUDE_DEALS:
            continue
        deal = deals.get(deal_id)
        if not deal:
            continue
        if calc_display_score(deal) >= SCORE_SKIP:
            continue

        last_good = None
        for v in vals:
            if not is_empty_audit(label, v):
                last_good = v
        if last_good is None:
            continue

        current = fmt_current(deal, label)
        if not is_empty_audit(label, current):
            continue
        if current == str(last_good):
            continue

        plan.append({
            "key": f"{deal_id}|{label}",
            "dealId": deal_id,
            "customer": deal.get("customer", ""),
            "owner": deal.get("owner", ""),
            "scoreNow": calc_display_score(deal),
            "label": label,
            "current": current[:200],
            "restore": str(last_good)[:500],
            "value": last_good,
            "reason": "empty_field",
        })
    return plan


def try_server_preview():
    try:
        return post({"action": "recoverSelective", "apply": False})
    except Exception:
        return None


def print_preview(plan, rules_note=""):
    by_deal = {}
    for p in plan:
        by_deal.setdefault(p["dealId"], []).append(p)

    print("=" * 72)
    print("PREVIEW: selective recovery (variant 4)")
    print("Rules: only EMPTY fields | skip score>=20 | exclude D-026")
    print("=" * 72)
    print(f"Total fields to restore: {len(plan)}")
    print(f"Deals affected: {len(by_deal)}")
    if rules_note:
        print(rules_note)
    print()

    for deal_id in sorted(by_deal.keys()):
        items = by_deal[deal_id]
        cust = items[0].get("customer", "")[:40]
        sc = items[0].get("scoreNow", "?")
        print(f"\n--- {deal_id} {cust} (ball now: {sc}) ---")
        for p in items:
            print(f"  [{p['key']}]")
            print(f"    field:   {p['label']}")
            print(f"    now:     {(p['current'] or '(empty)')[:100]}")
            print(f"    restore: {p['restore'][:120]}")

    print("\n" + "=" * 72)
    print(f"Saved: {PREVIEW_FILE}")
    print("To approve ALL:  python tools/recover_selective.py --apply")
    print("To approve SOME: edit tools/recover_approved.json with keys, then --apply --approved")
    print("=" * 72)


def main():
    apply = "--apply" in sys.argv
    use_approved = "--approved" in sys.argv
    approved_path = APPROVED_FILE
    if use_approved:
        idx = sys.argv.index("--approved")
        if idx + 1 < len(sys.argv):
            approved_path = Path(sys.argv[idx + 1])

    if apply:
        # Prefer server if recoverSelective deployed
        approved_keys = None
        if use_approved and approved_path.exists():
            approved_keys = json.loads(approved_path.read_text(encoding="utf-8"))
        try:
            res = post({
                "action": "recoverSelective",
                "apply": True,
                "approved": approved_keys,
            })
            if res.get("ok"):
                print(json.dumps({
                    "ok": True, "applied": True, "patches": res.get("patches"),
                    "auditRows": res.get("auditRows"), "updatedAt": res.get("updatedAt"),
                }, ensure_ascii=False, indent=2))
                return
        except Exception as e:
            print("Server recoverSelective unavailable, using local apply:", e)

        if not PREVIEW_FILE.exists():
            print("Run preview first (no recover_preview.json)")
            sys.exit(1)
        preview = json.loads(PREVIEW_FILE.read_text(encoding="utf-8"))
        plan = preview["plan"]
        if approved_keys:
            allow = set(approved_keys)
            plan = [p for p in plan if p["key"] in allow]

        state = fetch_get("?action=get")["state"]
        deal_index = {d["id"]: i for i, d in enumerate(state["deals"]) if d.get("id")}
        edited = set()
        for p in plan:
            idx = deal_index.get(p["dealId"])
            if idx is None:
                continue
            apply_field(state["deals"][idx], p["label"], p["value"])
            edited.add(p["dealId"])

        res = post({
            "action": "save",
            "state": state,
            "editedDealIds": list(edited),
        })
        print(json.dumps({
            "ok": res.get("ok"), "applied": len(plan), "editedDeals": list(edited),
            "auditRows": res.get("auditRows"), "updatedAt": res.get("updatedAt"),
        }, ensure_ascii=False, indent=2))
        return

    # PREVIEW
    server = try_server_preview()
    if server and server.get("ok") and server.get("plan") is not None:
        plan = server["plan"]
        source = "server"
        rules = server.get("rules", {})
    else:
        state = fetch_get("?action=get")["state"]
        rows = fetch_get("?action=auditAll").get("rows") or []
        plan = build_plan(state, rows)
        source = "local"
        rules = {"excludeDeals": list(EXCLUDE_DEALS), "skipDealsWithScoreGte": SCORE_SKIP}

    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "rules": rules,
        "planCount": len(plan),
        "dealCount": len({p["dealId"] for p in plan}),
        "plan": plan,
    }
    PREVIEW_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # Default approved = all keys for easy edit-down
    APPROVED_FILE.write_text(
        json.dumps([p["key"] for p in plan], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print_preview(plan, f"Source: {source}")


if __name__ == "__main__":
    main()
