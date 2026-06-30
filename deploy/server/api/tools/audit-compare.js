#!/usr/bin/env node
"use strict";
const { listAll } = require("../src/pb-client");
const { loadPipelineState } = require("../src/mapper");

const MANAGERS = ["Аркадий Мерлейн", "Александр Сироткин", "Арслан Ахметшин", "Алексей Кулагин"];
const SINCE = process.argv[2] || "2026-06-25T16:30:00.000Z";

const LABEL_TO_FIELD = {
  "Задачи проекта": "projectTasks",
  "Что ищут": "seekingSegments",
  "Что есть сейчас": "asIsStack",
  "Почему меняют": "changePains",
  "Конкуренты": "competitorEntries",
  "Риски": "riskTypes",
  "Комментарий к риску": "riskComment",
  "Статус коммита": "commitStatus",
  "Ключевые боли": "pains",
};

function parseAudit(field, raw) {
  const s = String(raw || "").trim();
  if (!s || s === "—") return null;
  if (field === "projectTasks") return s.split(";").map(x => x.trim()).filter(Boolean);
  if (field === "riskTypes" || field === "seekingSegments") return s.split(",").map(x => x.trim()).filter(Boolean);
  if (field === "asIsStack" || field === "changePains" || field === "competitorEntries") {
    try { return JSON.parse(s); } catch (_) { return s; }
  }
  return s;
}

function cur(deal, field) {
  if (["projectTasks", "seekingSegments", "asIsStack", "changePains", "competitorEntries"].includes(field)) {
    return deal.techResearch?.[field];
  }
  if (field === "riskTypes") return deal.riskTypes;
  return deal[field];
}

function preview(v) {
  return JSON.stringify(v).slice(0, 120);
}

function mismatch(field, auditVal, currentVal) {
  if (auditVal == null) return false;
  if (field === "projectTasks") {
    const a = auditVal || [];
    const c = currentVal || [];
    return a.length > 0 && a.some(t => !c.includes(t));
  }
  if (field === "asIsStack" && typeof auditVal === "object") {
    return Object.entries(auditVal).some(([k, v]) => {
      const cv = currentVal?.[k];
      const hasA = v && (v.vendor || v.product || v.comment);
      const hasC = cv && (cv.vendor || cv.product || cv.comment);
      return hasA && !hasC;
    });
  }
  if (field === "changePains" && typeof auditVal === "object") {
    return Object.entries(auditVal).some(([k, v]) => v && String(v).trim() && !(currentVal?.[k] && String(currentVal[k]).trim()));
  }
  if (Array.isArray(auditVal) && (!currentVal || !currentVal.length)) return auditVal.length > 0;
  if (typeof auditVal === "string" && auditVal && !currentVal) return true;
  return false;
}

(async () => {
  const rows = await listAll("audit_log", { filter: `at >= "${SINCE}"`, sort: "-at", perPage: 500 });
  const filtered = rows.filter(r => MANAGERS.includes(r.saved_by) && !r.is_new_deal);
  const byDealField = {};
  for (const r of filtered) {
    const field = LABEL_TO_FIELD[r.label];
    if (!field) continue;
    const key = `${r.deal_id}::${field}`;
    if (!byDealField[key] || r.at > byDealField[key].at) byDealField[key] = r;
  }

  const dealCache = {};
  let issues = 0;
  for (const [key, row] of Object.entries(byDealField)) {
    const [dealId, field] = key.split("::");
    const auditVal = parseAudit(field, row.new_value);
    if (!dealCache[dealId]) dealCache[dealId] = await loadPipelineState({ dealId });
    const deal = dealCache[dealId];
    if (!deal) continue;
    const currentVal = cur(deal, field);
    if (mismatch(field, auditVal, currentVal)) {
      issues++;
      console.log(`\nMISMATCH ${dealId} ${row.customer} [${row.saved_by}] ${row.label}`);
      console.log(`  audit:   ${preview(auditVal)}`);
      console.log(`  current: ${preview(currentVal)}`);
    }
  }
  console.log(`\nTotal mismatches: ${issues}`);
})().catch(e => { console.error(e); process.exit(1); });
