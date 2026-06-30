#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Normalize user manual audit analysis: incident vs pre-filled deals per manager."""
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = re.search(
    r'url:\s*"([^"]+)"',
    (ROOT / "js" / "gas-config.js").read_text(encoding="utf-8"),
).group(1)

OWNERS = {
    "sirotkin": "Александр Сироткин",
    "kulagin": "Алексей Кулагин",
    "akhmetshin": "Арслан Ахметшин",
}

# --- User-provided lists (manual audit analysis) ---
DATA = {
    "sirotkin": {
        "incident": [
            'АО "ЗОМЗ"',
            'АО "ЭК "ВОСТОК"',
            "АО «МХК «ЕвроХим»",
            "АО «ОТЛК ЕРА»",
            "АО Альфастрахование",
            "Банк ВТБ (ПАО)",
            "Войсковая часть 64829",
            "ГУП «Петербургский метрополитен»",
            "Минцифры ДНР",
            "МКБ",
            "Умное пространство (Еком Тех)",
        ],
        "prefilled": [
            "АО «МХК «ЕвроХим»",
            "АО «ОТЛК ЕРА»",
            "АО Альфастрахование",
            "Банк ВТБ (ПАО)",
            "ГУП «Петербургский метрополитен»",
            "МКБ",
            "НоваТЭК",
            "Умное пространство (Еком Тех)",
        ],
    },
    "kulagin": {
        "incident": [
            'АО "МОСПРОЕКТ-3"',
            'АО "ОЭК"',
            'АО "ЦКБ "Айсберг"',
            "АО «Апатит» (ФосАгро)",
            "АО «АЭХК»",
            "АО «Татэнерго»",
            "АО АКБ «Новикомбанк»",
            "ВТБ Факторинг",
            'ГБУЗ "Городская Больница Анапы"',
            'ГКУ Тверской области "ЦЗН Тверской области"',
            "Лукойл (дочка)",
            "МАОУ СОШ № 17 новый филиал ЖК «Краски»",
            "Московская Биржа",
            'ОАО "ЗАВОД ПРОДМАШ"',
            'ОАО АК "Уральские Авиалинии"',
            'ООО "АГК-1"',
            'ООО "Агроэко-Логистика"',
            'ООО "ЛАДА-МЕДИА"',
            'ООО "Тензор" Казань',
            'ООО "Цифра Брокер"',
            'ПАО "АК Барс" Банк',
            "ПАО «Газпром автоматизация»",
            "ПАО СК Росгосстрах",
            'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "НБД-БАНК"',
            'ФГАОУ ВО "Тюменский Государственный Университет"',
            'ФГАУ "НМИЦ "МНТК "Микрохирургия Глаза" им. Акад. С.Н. Федорова" Минздрава России',
            'ФГБНУ "РНЦХ им. Акад. Б.В. Петровского"',
            'ФГБОУ ВО "ВГУВТ"',
            'ФГБОУ ВО "Казанский Национальный Исследовательский Технический Университет им. А.Н. Туполева-Каи"',
            'ФГБОУ ВО "УГЛТУ"',
            'ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ УНИТАРНОЕ ПРЕДПРИЯТИЕ "ПРИБОРОСТРОИТЕЛЬНЫЙ ЗАВОД ИМЕНИ К.А. ВОЛОДИНА"',
            "ФСИН России",
            "Цифра Банк",
            'OOO "СУДОСТРОИТЕЛЬНЫЙ КОМПЛЕКС "ЗВЕЗДА"',
        ],
        "prefilled": [
            'АО "МОСПРОЕКТ-3"',
            'АО "ОЭК"',
            'АО "ЦКБ "Айсберг"',
            "АО «Апатит» (ФосАгро)",
            "АО «АЭХК»",
            "АО «Татэнерго»",
            "АО АКБ «Новикомбанк»",
            "ВТБ Факторинг",
            'ГБУЗ "Городская Больница Анапы"',
            'ГКУ Тверской области "ЦЗН Тверской области"',
            "Лукойл (дочка)",
            "МАОУ СОШ № 17 новый филиал ЖК «Краски»",
            "Московская Биржа",
            'ОАО "ЗАВОД ПРОДМАШ"',
            'ОАО АК "Уральские Авиалинии"',
            'ООО "АГК-1"',
            'ООО "Агроэко-Логистика"',
            'ООО "ЛАДА-МЕДИА"',
            'ООО "Тензор" Казань',
            'ООО "Цифра Брокер"',
            'ПАО "АК Барс" Банк',
            "ПАО «Газпром автоматизация»",
            "ПАО СК Росгосстрах",
            'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "НБД-БАНК"',
            'ФГАОУ ВО "Тюменский Государственный Университет"',
            'ФГАУ "НМИЦ "МНТК "Микрохирургия Глаза" им. Акад. С.Н. Федорова" Минздрава России',
            'ФГБНУ "РНЦХ им. Акад. Б.В. Петровского"',
            'ФГБОУ ВО "ВГУВТ"',
            'ФГБОУ ВО "Казанский Национальный Исследовательский Технический Университет им. А.Н. Туполева-Каи"',
            'ФГБОУ ВО "УГЛТУ"',
            'ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ УНИТАРНОЕ ПРЕДПРИЯТИЕ "ПРИБОРОСТРОИТЕЛЬНЫЙ ЗАВОД ИМЕНИ К.А. ВОЛОДИНА"',
            "ФСИН России",
            "Цифра Банк",
            'OOO "СУДОСТРОИТЕЛЬНЫЙ КОМПЛЕКС "ЗВЕЗДА"',
        ],
    },
    "akhmetshin": {
        "incident": [
            "Администрация Самары",
            "Велесстрой",
            'ГБУЗ "КЦРКБ"',
            "Кастор-Групп",
            "Областная детская клиническая больница",
            'ООО "МКС"',
            "ФГУП «Эндофарм»",
            "ЦБТ",
            "Центр-Инвест",
            "Этажи",
        ],
        "prefilled": [
            "Администрация Самары",
            "Велесстрой",
            'ГБУЗ "КЦРКБ"',
            "Кастор-Групп",
            "Мегавольт",
            "Областная детская клиническая больница",
            'ООО "МКС"',
            "ФГУП «Эндофарм»",
            "ЦБТ",
            "Центр-Инвест",
            "Этажи",
        ],
    },
}


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.lower().strip()
    s = s.replace("«", '"').replace("»", '"').replace("„", '"').replace(""", '"').replace(""", '"')
    s = s.replace("ооо", "ooo").replace("оао", "oao").replace("зао", "zao").replace("пао", "pao")
    s = s.replace("ао", "ao").replace("гбу", "gbu").replace("фгбу", "fgbu")
    s = re.sub(r'[«»""\'`]', "", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s\d]", "", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def fetch_state():
    return json.loads(urllib.request.urlopen(URL + "?action=get", timeout=300).read())["state"]


def match_customer(name: str, deals_by_owner: dict) -> tuple[str | None, str | None, float]:
    """Return (deal_id, canonical_customer, score)."""
    n = norm_name(name)
    best = None
    best_score = 0.0
    for did, cust in deals_by_owner.items():
        cn = norm_name(cust)
        if n == cn:
            return did, cust, 1.0
        if n in cn or cn in n:
            score = min(len(n), len(cn)) / max(len(n), len(cn))
            if score > best_score:
                best_score = score
                best = (did, cust, score)
        # token overlap
        nt = set(n.split())
        ct = set(cn.split())
        if len(nt) >= 2 and len(nt & ct) >= max(2, len(nt) * 0.6):
            score = len(nt & ct) / len(nt | ct)
            if score > best_score:
                best_score = score
                best = (did, cust, score)
    if best and best_score >= 0.45:
        return best
    return None, None, 0.0


def resolve_list(names: list[str], deals_by_owner: dict) -> list[dict]:
    out = []
    for name in names:
        did, cust, score = match_customer(name, deals_by_owner)
        out.append({
            "input": name,
            "deal_id": did,
            "customer": cust,
            "match_score": round(score, 2),
        })
    return out


def score_sum(d):
    return sum((d.get("scores") or {}).values())


def main():
    state = fetch_state()
    all_deals = {d["id"]: d for d in state["deals"]}

    report = {}
    summary_rows = []

    for key, owner in OWNERS.items():
        owner_deals = {d["id"]: d.get("customer", "") for d in state["deals"] if d.get("owner") == owner}
        inc = resolve_list(DATA[key]["incident"], owner_deals)
        pre = resolve_list(DATA[key]["prefilled"], owner_deals)

        inc_ids = {x["deal_id"] for x in inc if x["deal_id"]}
        pre_ids = {x["deal_id"] for x in pre if x["deal_id"]}

        # Classification
        affected_need_restore = inc_ids & pre_ids          # was filled, incident rolled back
        incident_only = inc_ids - pre_ids                  # incident but not in pre-filled list
        prefilled_not_incident = pre_ids - inc_ids           # filled before, incident didn't touch
        unmatched_inc = [x for x in inc if not x["deal_id"]]
        unmatched_pre = [x for x in pre if not x["deal_id"]]

        def pack(ids):
            return sorted(
                [{"id": i, "customer": all_deals[i].get("customer"), "score_sum": score_sum(all_deals[i])}
                 for i in ids],
                key=lambda x: int(x["id"].split("-")[1]),
            )

        report[key] = {
            "owner": owner,
            "counts": {
                "incident_list": len(DATA[key]["incident"]),
                "prefilled_list": len(DATA[key]["prefilled"]),
                "incident_matched": len(inc_ids),
                "prefilled_matched": len(pre_ids),
                "need_restore": len(affected_need_restore),
                "incident_only": len(incident_only),
                "prefilled_safe": len(prefilled_not_incident),
            },
            "need_restore": pack(affected_need_restore),
            "incident_only_not_in_prefilled": pack(incident_only),
            "prefilled_not_affected": pack(prefilled_not_incident),
            "unmatched_incident": unmatched_inc,
            "unmatched_prefilled": unmatched_pre,
            "mapping_incident": inc,
            "mapping_prefilled": pre,
        }

        summary_rows.append((owner, report[key]["counts"]))

    out_path = ROOT / "tools" / "incident_normalize_report.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 70)
    for key, owner in OWNERS.items():
        r = report[key]
        c = r["counts"]
        print(f"\n### {owner}")
        print(f"Инцидент (список): {c['incident_list']} | сопоставлено: {c['incident_matched']}")
        print(f"До инцидента заполнено: {c['prefilled_list']} | сопоставлено: {c['prefilled_matched']}")
        print()
        print(f"ВОССТАНОВИТЬ (заполнено до + откатилось): {c['need_restore']}")
        for d in r["need_restore"]:
            print(f"  {d['id']} | {d['customer']} | score={d['score_sum']}")
        print()
        print(f"Инцидент, но НЕ в списке заполненных до: {c['incident_only']}")
        for d in r["incident_only_not_in_prefilled"]:
            print(f"  {d['id']} | {d['customer']} | score={d['score_sum']}")
        print()
        print(f"Заполнено до, инцидент НЕ задел: {c['prefilled_safe']}")
        for d in r["prefilled_not_affected"]:
            print(f"  {d['id']} | {d['customer']} | score={d['score_sum']}")
        if r["unmatched_incident"] or r["unmatched_prefilled"]:
            print()
            print("НЕ сопоставлено с базой:")
            for x in r["unmatched_incident"]:
                print(f"  [incident] {x['input']}")
            for x in r["unmatched_prefilled"]:
                print(f"  [prefilled] {x['input']}")

    print("\n" + "=" * 70)
    print("ИТОГО:")
    total_restore = sum(r["counts"]["need_restore"] for r in report.values())
    total_safe = sum(r["counts"]["prefilled_safe"] for r in report.values())
    total_inc_only = sum(r["counts"]["incident_only"] for r in report.values())
    print(f"  Восстановить: {total_restore}")
    print(f"  Заполнено, не задело: {total_safe}")
    print(f"  Инцидент без pre-fill (отдельная категория): {total_inc_only}")
    print(f"\nJSON: {out_path}")


if __name__ == "__main__":
    main()
