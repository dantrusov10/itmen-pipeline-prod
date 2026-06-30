#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Импорт требований clientmap из CSV (экспорт Google Sheets PSI).

  python3 import-clientmap-requirements.py sheet.csv              # dry-run
  python3 import-clientmap-requirements.py sheet.csv --apply
  python3 import-clientmap-requirements.py sheet.csv --apply --force
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime

FEAS_SCORE = {
    "полностью": 1.0,
    "частично": 0.6,
    "нет": 0.0,
    "нет возможности": 0.0,
    "хард код (скоро)": 0.7,
    "хард код (не скоро)": 0.3,
    "требуется скрипт": 0.5,
}

LEGAL_PREFIXES = re.compile(
    r"^(ооо|оао|зао|пао|ао|мкпао|ип|фгуп|гбуз|гбу|гку|муп|гуп)\s+",
    re.IGNORECASE,
)


def load_env():
    email = os.environ.get("PB_ADMIN_EMAIL", "")
    password = os.environ.get("PB_ADMIN_PASSWORD", "")
    pb = os.environ.get("PB_URL", "http://127.0.0.1:8095")
    path = "/opt/itmen-pipeline/.env"
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k == "PB_ADMIN_EMAIL" and not email:
                email = v
            elif k == "PB_ADMIN_PASSWORD" and not password:
                password = v
            elif k == "PB_URL" and not pb:
                pb = v
    return pb.rstrip("/"), email, password


def http_json(url, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {url}: {detail}") from e


def admin_token(pb, email, password):
    return http_json(
        f"{pb}/api/admins/auth-with-password",
        {"identity": email, "password": password},
    )["token"]


def normalize_company(name: str) -> str:
    s = (name or "").strip().lower()
    s = s.replace("«", "").replace("»", "").replace('"', "").replace("'", "")
    s = LEGAL_PREFIXES.sub("", s)
    s = s.replace("ё", "е")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def feas_score(label: str):
    if not label or str(label).strip() in ("—", "-", ""):
        return None
    return FEAS_SCORE.get(str(label).strip().lower())


def parse_bool_must(val: str) -> bool:
    v = str(val or "").strip().lower()
    return v in ("да", "yes", "1", "true")


def load_csv(path: str):
    # Google Sheets export is standard comma-separated CSV; csv.Sniffer mis-detects
    # dialect and truncates/corrupts the large JSON payload column.
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def row_date(row):
    ts = row.get("timestamp") or ""
    return ts[:10] if len(ts) >= 10 else ""


def filter_rows_since(rows, since):
    if not since:
        return rows
    return [r for r in rows if row_date(r) >= since]


def pick_latest_runs(rows):
    """company -> best row (most requirements, then latest timestamp)."""
    by_company = {}
    for row in rows:
        company = (row.get("company") or "").strip()
        if not company or len(company) > 120:
            continue
        key = normalize_company(company)
        ts = row.get("timestamp") or row.get("run_id") or ""
        score = len(extract_pilot_rows(row)) + len(extract_product_rows(row))
        prev = by_company.get(key)
        if not prev:
            row_copy = dict(row)
            row_copy["_ts"] = ts
            row_copy["_company_raw"] = company
            row_copy["_score"] = score
            by_company[key] = row_copy
            continue
        prev_score = prev.get("_score", 0)
        if score > prev_score or (score == prev_score and str(ts) > str(prev.get("_ts", ""))):
            row_copy = dict(row)
            row_copy["_ts"] = ts
            row_copy["_company_raw"] = company
            row_copy["_score"] = score
            by_company[key] = row_copy
    return by_company


def trunc(s, n):
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def parse_payload(row):
    raw = row.get("payload") or ""
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def field_get(row, payload, key, default=""):
    v = row.get(key)
    if v is not None and str(v).strip() != "":
        return v
    return payload.get(key, default)


def extract_pilot_rows(sheet_row):
    payload = parse_payload(sheet_row)
    out = []
    for i in range(1, 21):
        p = f"{i:02d}"
        text = trunc(field_get(sheet_row, payload, f"req_{p}_text"), 2000)
        if not text:
            continue
        feas = (field_get(sheet_row, payload, f"req_{p}_feas") or "—").strip() or "—"
        out.append({
            "business_need": trunc(field_get(sheet_row, payload, f"req_{p}_biz"), 500),
            "client_requirement": text,
            "req_type": trunc(field_get(sheet_row, payload, f"req_{p}_type") or "Тех", 40) or "Тех",
            "is_mandatory": parse_bool_must(field_get(sheet_row, payload, f"req_{p}_must")),
            "feasibility": trunc(feas, 80),
            "feasibility_score": feas_score(feas),
            "verification_metric": trunc(field_get(sheet_row, payload, f"req_{p}_metric"), 500),
            "owner": trunc(field_get(sheet_row, payload, f"req_{p}_owner"), 120),
        })
    return out


def extract_product_rows(sheet_row):
    payload = parse_payload(sheet_row)
    out = []
    for i in range(1, 31):
        p = f"{i:02d}"
        biz = trunc(
            field_get(sheet_row, payload, f"prodreq_{p}_biz")
            or field_get(sheet_row, payload, f"prod_{p}_biz"),
            2000,
        )
        func = trunc(
            field_get(sheet_row, payload, f"prodreq_{p}_func")
            or field_get(sheet_row, payload, f"prod_{p}_func"),
            2000,
        )
        if not biz and not func:
            continue
        feas = (
            field_get(sheet_row, payload, f"prodreq_{p}_feas")
            or field_get(sheet_row, payload, f"prod_{p}_feas")
            or "—"
        ).strip() or "—"
        out.append({
            "business_requirement": biz,
            "functional_requirement": func,
            "req_type": trunc(
                field_get(sheet_row, payload, f"prodreq_{p}_type")
                or field_get(sheet_row, payload, f"prod_{p}_type")
                or "Тех",
                40,
            ) or "Тех",
            "is_mandatory": parse_bool_must(
                field_get(sheet_row, payload, f"prodreq_{p}_must")
                or field_get(sheet_row, payload, f"prod_{p}_must")
            ),
            "feasibility": trunc(feas, 80),
            "feasibility_score": feas_score(feas),
        })
    return out


def compute_pct(rows, mode):
    scores = []
    for r in rows:
        if mode == "pilot":
            if not r.get("client_requirement") and not r.get("business_need"):
                continue
        elif not r.get("functional_requirement") and not r.get("business_requirement"):
            continue
        s = r.get("feasibility_score")
        if s is not None:
            scores.append(float(s))
    if not scores:
        return None
    return round(sum(scores) / len(scores) * 100)


def list_all_records(pb, token, collection, filter_q="", sort=""):
    items = []
    page = 1
    while True:
        q = urllib.parse.urlencode({
            "page": page, "perPage": 200,
            "filter": filter_q, "sort": sort,
        })
        data = http_json(f"{pb}/api/collections/{collection}/records?{q}", token=token)
        items.extend(data.get("items", []))
        if page >= data.get("totalPages", 1):
            break
        page += 1
    return items


def pb_create(pb, token, collection, body):
    clean = {k: v for k, v in body.items() if v is not None}
    return http_json(f"{pb}/api/collections/{collection}/records", clean, token=token, method="POST")


def pb_update(pb, token, collection, rec_id, body):
    return http_json(f"{pb}/api/collections/{collection}/records/{rec_id}", body, token=token, method="PATCH")


def pb_delete_filter(pb, token, collection, filter_q):
    rows = list_all_records(pb, token, collection, filter_q)
    for row in rows:
        http_json(
            f"{pb}/api/collections/{collection}/records/{row['id']}",
            token=token, method="DELETE",
        )
    return len(rows)


def sync_deal_tech(pb, token, pb_deal_id, pilot_pct, product_pct):
    tech = list_all_records(pb, token, "deal_tech", f'deal="{pb_deal_id}"')
    body = {
        "product_requirements_pct": product_pct,
        "pilot_requirements_pct": pilot_pct,
    }
    if tech:
        pb_update(pb, token, "deal_tech", tech[0]["id"], body)
    else:
        pb_create(pb, token, "deal_tech", {
            "deal": pb_deal_id,
            "seeking_other_label": "",
            **body,
        })


def import_for_deal(pb, token, deal, pilot_rows, product_rows, run_id, apply, force):
    pb_id = deal["id"]
    deal_id = deal.get("deal_id", "")
    existing_pilot = list_all_records(pb, token, "pilot_requirements", f'deal="{pb_id}"', sort="sort_order")
    existing_prod = list_all_records(pb, token, "product_requirements", f'deal="{pb_id}"', sort="sort_order")

    if (existing_pilot or existing_prod) and not force:
        return "skipped_has_data"

    if not pilot_rows and not product_rows:
        return "skipped_empty"

    pilot_pct = compute_pct(pilot_rows, "pilot")
    product_pct = compute_pct(product_rows, "product")

    if not apply:
        return "would_import"

    if force:
        pb_delete_filter(pb, token, "pilot_requirements", f'deal="{pb_id}"')
        pb_delete_filter(pb, token, "product_requirements", f'deal="{pb_id}"')

    for i, row in enumerate(pilot_rows):
        pb_create(pb, token, "pilot_requirements", {
            "deal": pb_id,
            "sort_order": i,
            "source": "clientmap_import",
            "legacy_run_id": run_id or "",
            "updated_by": "import-clientmap",
            **row,
        })
    for i, row in enumerate(product_rows):
        pb_create(pb, token, "product_requirements", {
            "deal": pb_id,
            "sort_order": i,
            "source": "clientmap_import",
            "legacy_run_id": run_id or "",
            "updated_by": "import-clientmap",
            **row,
        })

    pb_update(pb, token, "deals", pb_id, {
        "pilot_feasibility_pct": pilot_pct,
        "product_feasibility_pct": product_pct,
        "pilot_req_count": len(pilot_rows),
        "product_req_count": len(product_rows),
        "requirements_updated_at": datetime.utcnow().isoformat() + "Z",
    })
    sync_deal_tech(pb, token, pb_id, pilot_pct, product_pct)
    return "imported"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--force", action="store_true", help="перезаписать существующие требования")
    ap.add_argument("--since", default="", help="только строки с датой YYYY-MM-DD и новее")
    ap.add_argument("--report", default="import-clientmap-report.json")
    args = ap.parse_args()

    if not os.path.isfile(args.csv_path):
        print(f"File not found: {args.csv_path}")
        return 1

    rows = load_csv(args.csv_path)
    if args.since:
        rows = filter_rows_since(rows, args.since)
        print(f"rows since {args.since}: {len(rows)}")
    latest = pick_latest_runs(rows)
    pb, email, password = load_env()
    token = admin_token(pb, email, password)

    deals = list_all_records(pb, token, "deals")
    deal_by_norm = {}
    deal_by_id = {}
    for d in deals:
        did = str(d.get("deal_id") or "").strip().upper()
        if did:
            deal_by_id[did] = d
        c = normalize_company(d.get("customer") or "")
        if c and c not in deal_by_norm:
            deal_by_norm[c] = d

    aliases_path = os.path.join(os.path.dirname(__file__), "clientmap-company-aliases.json")
    aliases = {}
    if os.path.isfile(aliases_path):
        aliases = json.load(open(aliases_path, encoding="utf-8"))

    def resolve_deal(company_raw):
        key = normalize_company(company_raw)
        if key in deal_by_norm:
            return deal_by_norm[key], "exact"
        alias_target = aliases.get(company_raw) or aliases.get(key)
        if alias_target:
            target = str(alias_target).strip()
            if re.match(r"^D-\d+$", target, re.I):
                deal = deal_by_id.get(target.upper())
                if deal:
                    return deal, "alias_deal_id"
            ak = normalize_company(target)
            if ak in deal_by_norm:
                return deal_by_norm[ak], "alias"
        if key and len(key) >= 4:
            for dk, deal in deal_by_norm.items():
                if key in dk or dk in key:
                    return deal, "contains"
        return None, None

    stats = {"imported": 0, "would_import": 0, "skipped_has_data": 0, "skipped_empty": 0, "unmatched": []}
    details = []

    for norm, sheet_row in latest.items():
        company_raw = sheet_row.get("_company_raw") or sheet_row.get("company") or ""
        deal, match_type = resolve_deal(company_raw)
        pilot_rows = extract_pilot_rows(sheet_row)
        product_rows = extract_product_rows(sheet_row)
        run_id = sheet_row.get("run_id") or ""
        payload = parse_payload(sheet_row)

        if not deal:
            if pilot_rows or product_rows:
                stats["unmatched"].append({
                    "company": company_raw,
                    "pilot": len(pilot_rows),
                    "product": len(product_rows),
                    "pilot_pct": compute_pct(pilot_rows, "pilot"),
                    "product_pct": compute_pct(product_rows, "product"),
                    "presale": sheet_row.get("presale_manager") or payload.get("presale_manager") or "",
                    "timestamp": sheet_row.get("timestamp") or "",
                    "run_id": run_id,
                })
            continue

        try:
            status = import_for_deal(
                pb, token, deal, pilot_rows, product_rows, run_id, args.apply, args.force,
            )
        except Exception as e:
            status = "error"
            stats["errors"] = stats.get("errors", 0) + 1
            details.append({
                "deal_id": deal.get("deal_id"),
                "customer": deal.get("customer"),
                "status": "error",
                "error": str(e),
            })
            continue
        stats[status] = stats.get(status, 0) + 1
        if status in ("imported", "would_import"):
            details.append({
                "deal_id": deal.get("deal_id"),
                "customer": deal.get("customer"),
                "company_sheet": company_raw,
                "match_type": match_type,
                "status": status,
                "pilot": len(pilot_rows),
                "product": len(product_rows),
                "pilot_pct": compute_pct(pilot_rows, "pilot"),
                "product_pct": compute_pct(product_rows, "product"),
            })

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"import-clientmap [{mode}]")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    if stats["unmatched"]:
        print(f"unmatched companies: {len(stats['unmatched'])}")
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump({"stats": stats, "details": details, "unmatched": stats["unmatched"]}, f, ensure_ascii=False, indent=2)
    print(f"report: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
