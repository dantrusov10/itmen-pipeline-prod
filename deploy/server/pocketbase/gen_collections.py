#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Схема v3: нормализованные сущности.
Реестр вендоров/продуктов (globalCatalog) — только в js/architecture-data.js на фронте.
На сделках: catalog_key + vendor/product как атрибуты выбора.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "pocketbase" / "collections.import.json"
SCHEMA_VERSION = 3

# Стабильные id коллекций (для relation)
def cid(name):
    h = hashlib.md5(f"itmen.coll.{name}".encode()).hexdigest()[:12]
    return f"itm{h}"


CID = {name: cid(name) for name in [
    "deals", "list_items", "scoring_criteria", "pipeline_meta", "managers",
    "deal_risks", "deal_scores", "deal_score_history", "deal_score_history_items",
    "deal_tech", "deal_seeking_segments", "deal_project_tasks", "deal_as_is",
    "deal_change_pains", "deal_competitors", "audit_log", "snapshots_daily",
    "snapshots_deals", "import_log",
]}


def fid(name):
    return hashlib.md5(f"itmen.{name}".encode()).hexdigest()[:15]


def fld(name, typ, **opts):
    f = {
        "system": False,
        "id": fid(name),
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
    elif typ == "editor":
        f["options"] = {"convertUrls": False}
    elif typ == "bool":
        f["options"] = {}
    elif typ == "relation":
        f["options"] = {
            "collectionId": opts["collectionId"],
            "cascadeDelete": bool(opts.get("cascadeDelete", True)),
            "minSelect": opts.get("minSelect", 1 if opts.get("required") else 0),
            "maxSelect": opts.get("maxSelect", 1),
            "displayFields": opts.get("displayFields", []),
        }
    return f


def coll(cid, name, fields, rules=None):
    rules = rules or {}
    return {
        "id": cid,
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


def deal_rel(**kw):
    return fld("deal", "relation", collectionId=CID["deals"], displayFields=["deal_id", "customer"], **kw)


PUBLIC = {"listRule": "", "viewRule": "", "createRule": None, "updateRule": None, "deleteRule": None}
ADMIN = {"listRule": None, "viewRule": None, "createRule": None, "updateRule": None, "deleteRule": None}

collections = [
    # ── Ядро ─────────────────────────────────────────────
    coll(CID["deals"], "deals", [
        fld("deal_id", "text", required=True, unique=True, presentable=True),
        fld("customer", "text", presentable=True),
        fld("industry", "text"), fld("owner", "text"), fld("stage", "text"),
        fld("deal_type", "text"),
        fld("amount", "number"), fld("expected_budget", "number"),
        fld("partner", "text"),
        fld("partner_discount", "number"), fld("client_discount", "number"),
        fld("manual_prob", "number"),
        fld("task_due", "text"), fld("budget_period", "text"), fld("budget_status", "text"),
        fld("budget_planned_month", "number", noDecimal=True),
        fld("budget_planned_year", "number", noDecimal=True),
        fld("pains", "editor"),
        fld("capabilities", "text"), fld("dml", "text"),
        fld("next_step_type", "text"), fld("next_step_comment", "text"),
        fld("risk_type", "text"), fld("risk_comment", "text"),
        fld("commit_status", "text"), fld("last_update", "text"),
        fld("amo_id", "number", noDecimal=True),
        fld("has_pains", "bool"),
        fld("competitors", "text"),
        fld("deal_updated_at", "date"),
    ], PUBLIC),

    coll(CID["list_items"], "list_items", [
        fld("list_key", "text", required=True),
        fld("value", "text", required=True),
        fld("sort_order", "number", noDecimal=True),
        fld("active", "bool"),
    ], PUBLIC),

    coll(CID["scoring_criteria"], "scoring_criteria", [
        fld("criterion_key", "text", required=True, unique=True),
        fld("name", "text", required=True),
        fld("weight", "number"),
        fld("col", "text"), fld("owner", "text"),
        fld("question", "editor"),
        fld("manual_only", "bool"),
        fld("rubric_s5", "editor"), fld("rubric_s4", "editor"),
        fld("rubric_s3", "editor"), fld("rubric_s2", "editor"),
        fld("rubric_s1", "editor"), fld("rubric_s0", "editor"),
        fld("sort_order", "number", noDecimal=True),
    ], PUBLIC),

    coll(CID["pipeline_meta"], "pipeline_meta", [
        fld("slug", "text", required=True, unique=True),
        fld("next_id", "number", noDecimal=True),
        fld("data_epoch", "number", noDecimal=True),
        fld("saved_at", "date"), fld("saved_by", "text"),
        fld("focus_title", "text"), fld("focus_goal", "editor"),
        fld("focus_risk", "editor"), fld("focus_next_step", "editor"),
    ], PUBLIC),

    coll(CID["managers"], "managers", [
        fld("manager_id", "text", required=True, unique=True),
        fld("name", "text", required=True),
        fld("sheet", "text"),
        fld("active", "bool"),
    ], PUBLIC),

    # ── Сделка: риски и скоринг ───────────────────────────
    coll(CID["deal_risks"], "deal_risks", [
        deal_rel(required=True),
        fld("risk_type", "text", required=True),
    ], PUBLIC),

    coll(CID["deal_scores"], "deal_scores", [
        deal_rel(required=True),
        fld("criterion_key", "text", required=True),
        fld("value", "number", noDecimal=True),
        fld("reason", "editor"),
        fld("overridden", "bool"),
    ], PUBLIC),

    coll(CID["deal_score_history"], "deal_score_history", [
        deal_rel(required=True),
        fld("recorded_at", "text", required=True),
        fld("source", "text"),
    ], PUBLIC),

    coll(CID["deal_score_history_items"], "deal_score_history_items", [
        fld("history", "relation", required=True, collectionId=CID["deal_score_history"],
            cascadeDelete=True, displayFields=["recorded_at"]),
        fld("criterion_key", "text", required=True),
        fld("value", "number", noDecimal=True),
    ], PUBLIC),

    # ── Сделка: тех. исследование ─────────────────────────
    coll(CID["deal_tech"], "deal_tech", [
        deal_rel(required=True),
        fld("seeking_other_label", "text"),
        fld("product_requirements_pct", "number"),
        fld("pilot_requirements_pct", "number"),
    ], PUBLIC),

    coll(CID["deal_seeking_segments"], "deal_seeking_segments", [
        deal_rel(required=True),
        fld("segment_id", "text", required=True),
        fld("sort_order", "number", noDecimal=True),
    ], PUBLIC),

    coll(CID["deal_project_tasks"], "deal_project_tasks", [
        deal_rel(required=True),
        fld("task", "text", required=True),
        fld("sort_order", "number", noDecimal=True),
    ], PUBLIC),

    coll(CID["deal_as_is"], "deal_as_is", [
        deal_rel(required=True),
        fld("segment_id", "text", required=True),
        fld("vendor", "text"), fld("product", "text"),
        fld("catalog_key", "text"),
        fld("comment", "editor"),
        fld("custom", "bool"),
    ], PUBLIC),

    coll(CID["deal_change_pains"], "deal_change_pains", [
        deal_rel(required=True),
        fld("segment_id", "text", required=True),
        fld("pain_text", "editor"),
    ], PUBLIC),

    coll(CID["deal_competitors"], "deal_competitors", [
        deal_rel(required=True),
        fld("segment_id", "text", required=True),
        fld("vendor", "text"), fld("product", "text"),
        fld("catalog_key", "text"),
        fld("status", "text"),
        fld("reject_reason", "editor"),
        fld("continue_reason", "editor"),
        fld("comment", "editor"),
        fld("sort_order", "number", noDecimal=True),
    ], PUBLIC),

    # ── Аудит и снапшоты ──────────────────────────────────
    coll(CID["audit_log"], "audit_log", [
        fld("at", "text"), fld("saved_by", "text"),
        fld("deal_id", "text"), fld("customer", "text"), fld("owner", "text"),
        fld("change_count", "number", noDecimal=True),
        fld("label", "text"),
        fld("old_value", "editor"), fld("new_value", "editor"),
        fld("is_new_deal", "bool"),
    ], ADMIN),

    coll(CID["snapshots_daily"], "snapshots_daily", [
        fld("date", "text"), fld("ts", "date"), fld("source", "text"),
        fld("deal_count", "number", noDecimal=True),
        fld("total_pipeline", "number"), fld("weighted_pipeline", "number"),
        fld("hot_count", "number", noDecimal=True),
        fld("warm_count", "number", noDecimal=True),
        fld("avg_score", "number", noDecimal=True),
    ], ADMIN),

    coll(CID["snapshots_deals"], "snapshots_deals", [
        fld("date", "text"), fld("ts", "date"),
        fld("deal_id", "text"), fld("customer", "text"), fld("owner", "text"),
        fld("score", "number", noDecimal=True),
        fld("amount", "number"), fld("category", "text"),
    ], ADMIN),

    coll(CID["import_log"], "import_log", [
        fld("source", "text"),
        fld("started_at", "date"), fld("finished_at", "date"),
        fld("status", "text"),
        fld("deals_count", "number", noDecimal=True),
        fld("audit_count", "number", noDecimal=True),
        fld("meta_count", "number", noDecimal=True),
        fld("notes", "editor"), fld("error", "editor"),
    ], ADMIN),
]

manifest = {
    "schemaVersion": SCHEMA_VERSION,
    "collections": [c["name"] for c in collections],
    "relations": [
        "deal_* → deals (cascade delete)",
        "deal_score_history_items → deal_score_history",
    ],
    "notInPb": "Реестр вендоров/продуктов (globalCatalog) — architecture-data.js на фронте",
}

OUT_JSON.write_text(json.dumps(collections, ensure_ascii=False, indent=2), encoding="utf-8")
(ROOT / "pocketbase" / "schema.manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
)

print(f"schema v{SCHEMA_VERSION}: {len(collections)} collections, 0 JSON-полей в сделках")
print(f"Wrote {OUT_JSON}")
