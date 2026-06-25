#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Генерация collections.import.json и pb_migrations/*.js для PocketBase."""
import json
import random
import string
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "pocketbase" / "collections.import.json"
DEPLOY_MIG = ROOT / "pb_migrations" / "1730000001_itmen_pipeline_collections.js"


def rid(n=15):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def fld(name, typ, **opts):
    f = {
        "system": False,
        "id": rid(),
        "name": name,
        "type": typ,
        "required": bool(opts.get("required")),
        "presentable": bool(opts.get("presentable")),
        "unique": bool(opts.get("unique")),
    }
    if typ == "text":
        f["options"] = {"min": None, "max": opts.get("max"), "pattern": opts.get("pattern", "")}
    elif typ == "number":
        f["options"] = {"min": None, "max": None, "noDecimal": bool(opts.get("noDecimal"))}
    elif typ == "date":
        f["options"] = {"min": "", "max": ""}
    elif typ == "json":
        f["options"] = {"maxSize": opts.get("maxSize", 2_000_000)}
    elif typ == "editor":
        f["options"] = {"convertUrls": False}
    return f


def coll(name, fields, rules=None):
    rules = rules or {}
    return {
        "id": rid(),
        "name": name,
        "type": "base",
        "system": False,
        "schema": fields,
        "indexes": rules.get("indexes", []),
        "listRule": rules.get("listRule", ""),
        "viewRule": rules.get("viewRule", ""),
        "createRule": rules.get("createRule"),
        "updateRule": rules.get("updateRule"),
        "deleteRule": rules.get("deleteRule"),
    }


DEALS_FIELDS = [
    fld("deal_id", "text", required=True, unique=True, presentable=True),
    fld("customer", "text", presentable=True),
    fld("industry", "text"),
    fld("owner", "text"),
    fld("stage", "text"),
    fld("deal_type", "text"),
    fld("amount", "number"),
    fld("expected_budget", "number"),
    fld("partner", "text"),
    fld("partner_discount", "number"),
    fld("client_discount", "number"),
    fld("manual_prob", "number"),
    fld("task_due", "text"),
    fld("budget_period", "text"),
    fld("budget_status", "text"),
    fld("budget_planned_month", "number", noDecimal=True),
    fld("budget_planned_year", "number", noDecimal=True),
    fld("pains", "editor"),
    fld("capabilities", "text"),
    fld("dml", "text"),
    fld("next_step_type", "text"),
    fld("next_step_comment", "text"),
    fld("risk_type", "text"),
    fld("risk_types", "json"),
    fld("risk_comment", "text"),
    fld("commit_status", "text"),
    fld("last_update", "text"),
    fld("amo_id", "number", noDecimal=True),
    fld("deal_updated_at", "date"),
    fld("tech_research", "json", maxSize=5_000_000),
    fld("scores", "json"),
    fld("score_reasons", "json"),
    fld("score_history", "json"),
    fld("scores_overridden", "json"),
    fld("payload", "json", maxSize=5_000_000),
]

META_FIELDS = [
    fld("slug", "text", required=True, unique=True),
    fld("next_id", "number", noDecimal=True),
    fld("data_epoch", "number", noDecimal=True),
    fld("lists", "json", maxSize=2_000_000),
    fld("saved_at", "date"),
]

AUDIT_FIELDS = [
    fld("at", "text"),
    fld("saved_by", "text"),
    fld("deal_id", "text"),
    fld("customer", "text"),
    fld("owner", "text"),
    fld("change_count", "number", noDecimal=True),
    fld("label", "text"),
    fld("old_value", "editor"),
    fld("new_value", "editor"),
]

SNAP_DAILY_FIELDS = [
    fld("date", "text"),
    fld("ts", "date"),
    fld("deal_count", "number", noDecimal=True),
    fld("total_pipeline", "number"),
    fld("weighted_pipeline", "number"),
    fld("hot_count", "number", noDecimal=True),
    fld("warm_count", "number", noDecimal=True),
    fld("avg_score", "number", noDecimal=True),
]

SNAP_DEAL_FIELDS = [
    fld("date", "text"),
    fld("ts", "date"),
    fld("deal_id", "text"),
    fld("customer", "text"),
    fld("owner", "text"),
    fld("score", "number", noDecimal=True),
    fld("amount", "number"),
    fld("category", "text"),
]

PUBLIC_READ = {"listRule": "", "viewRule": "", "createRule": None, "updateRule": None, "deleteRule": None}
ADMIN_ONLY = {"listRule": None, "viewRule": None, "createRule": None, "updateRule": None, "deleteRule": None}

collections = [
    coll("deals", DEALS_FIELDS, PUBLIC_READ),
    coll("pipeline_meta", META_FIELDS, PUBLIC_READ),
    coll("audit_log", AUDIT_FIELDS, ADMIN_ONLY),
    coll("snapshots_daily", SNAP_DAILY_FIELDS, ADMIN_ONLY),
    coll("snapshots_deals", SNAP_DEAL_FIELDS, ADMIN_ONLY),
]

OUT_JSON.write_text(json.dumps(collections, ensure_ascii=False, indent=2), encoding="utf-8")

# migration JS
js_collections = json.dumps(collections, ensure_ascii=False, indent=2)
migration = f"""/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {{
  const dao = new Dao(db);
  const specs = {js_collections};
  for (const spec of specs) {{
    dao.saveCollection(new Collection(spec));
  }}
}}, (db) => {{
  const dao = new Dao(db);
  for (const name of ["snapshots_deals", "snapshots_daily", "audit_log", "pipeline_meta", "deals"]) {{
    try {{
      const c = dao.findCollectionByNameOrId(name);
      dao.deleteCollection(c);
    }} catch (_) {{}}
  }}
}});
"""

for path in (DEPLOY_MIG,):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(migration, encoding="utf-8")

print(f"Wrote {OUT_JSON}")
print(f"Wrote {DEPLOY_MIG}")
