#!/usr/bin/env node
"use strict";

/**
 * Compare audit_log (since cutoff) with current PB deal state.
 * Restore fields that audit shows were filled but are now empty/missing.
 *
 * Usage on prod:
 *   node tools/restore-from-audit.js --since 2026-06-25T16:30:00.000Z [--dry-run] [--apply]
 */

const path = require("path");
process.chdir(path.join(__dirname, "..", "deploy", "server", "api"));

const { listAll, findOne, createRecord, deleteByFilter } = require("./src/pb-client");
const { loadDealByBusinessId } = require("./src/mapper");

const MANAGERS = [
  "Аркадий Мерлейн",
  "Александр Сироткин",
  "Арслан Ахметшин",
  "Алексей Кулагин",
];

const LABEL_TO_FIELD = {
  "Клиент": "customer",
  "Отрасль": "industry",
  "Владелец": "owner",
  "Стадия": "stage",
  "Ожид. сумма": "amount",
  "Ожид. бюджет": "expectedBudget",
  "Партнёр": "partner",
  "Скидка партнёру, %": "partnerDiscount",
  "Скидка клиенту, %": "clientDiscount",
  "Вероятность": "manualProb",
  "Срок задачи": "taskDue",
  "Срок бюджета": "budgetPeriod",
  "Статус бюджета": "budgetStatus",
  "Месяц согласования": "budgetPlannedMonth",
  "Год согласования": "budgetPlannedYear",
  "Статус коммита": "commitStatus",
  "Ключевые боли": "pains",
  "Риски": "riskTypes",
  "Комментарий к риску": "riskComment",
  "Скоринг": "scores",
  "Что ищут": "seekingSegments",
  "Другое (что ищут)": "seekingOtherLabel",
  "% требований проекта": "productRequirementsPct",
  "% требований пилота": "pilotRequirementsPct",
  "Что есть сейчас": "asIsStack",
  "Почему меняют": "changePains",
  "Конкуренты": "competitorEntries",
  "Задачи проекта": "projectTasks",
};

const TECH_FIELDS = new Set([
  "seekingSegments", "seekingOtherLabel", "productRequirementsPct",
  "pilotRequirementsPct", "asIsStack", "changePains", "competitorEntries", "projectTasks",
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { since: "2026-06-25T16:30:00.000Z", dryRun: true, apply: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--since" && args[i + 1]) opts.since = args[++i];
    else if (args[i] === "--apply") { opts.apply = true; opts.dryRun = false; }
    else if (args[i] === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

function isEmpty(val) {
  if (val == null || val === "") return true;
  if (Array.isArray(val)) return val.length === 0 || val.every(x => !x);
  if (typeof val === "object") {
    const keys = Object.keys(val);
    if (!keys.length) return true;
    return keys.every(k => {
      const v = val[k];
      if (v == null || v === "") return true;
      if (typeof v === "object" && !Array.isArray(v)) {
        return !Object.values(v).some(x => x != null && x !== "");
      }
      if (Array.isArray(v)) return v.length === 0;
      return false;
    });
  }
  return false;
}

function parseAuditValue(field, raw) {
  const s = String(raw || "").trim();
  if (!s || s === "—") return null;
  if (field === "projectTasks") {
    return s.split(";").map(x => x.trim()).filter(Boolean);
  }
  if (field === "riskTypes" || field === "seekingSegments") {
    return s.split(",").map(x => x.trim()).filter(Boolean);
  }
  if (field === "scores" || field === "asIsStack" || field === "changePains" || field === "competitorEntries") {
    try { return JSON.parse(s); } catch (_) { return s; }
  }
  if (field === "productRequirementsPct" || field === "pilotRequirementsPct"
      || field === "budgetPlannedMonth" || field === "budgetPlannedYear"
      || field === "amount" || field === "expectedBudget") {
    const n = Number(String(s).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : s;
  }
  if (field === "manualProb") {
    const m = s.match(/(\d+)/);
    return m ? Number(m[1]) / 100 : s;
  }
  return s;
}

function currentFieldValue(deal, field) {
  if (TECH_FIELDS.has(field)) return deal.techResearch?.[field];
  if (field === "riskTypes") {
    return deal.riskTypes?.length ? deal.riskTypes : (deal.riskType && deal.riskType !== "none" ? [deal.riskType] : []);
  }
  return deal[field];
}

function hasMeaningfulAuditValue(field, val) {
  if (val == null) return false;
  if (isEmpty(val)) return false;
  if (field === "asIsStack" && typeof val === "object") {
    return Object.values(val).some(v => v && (v.vendor || v.product || v.comment));
  }
  if (field === "changePains" && typeof val === "object") {
    return Object.values(val).some(v => v && String(v).trim());
  }
  if (field === "competitorEntries" && typeof val === "object") {
    return Object.values(val).some(arr => (arr || []).some(e => e && (e.vendor || e.product)));
  }
  return true;
}

function shouldRestore(field, auditVal, currentVal) {
  if (!hasMeaningfulAuditValue(field, auditVal)) return false;
  if (isEmpty(currentVal)) return true;
  if (field === "projectTasks" && Array.isArray(auditVal) && Array.isArray(currentVal)) {
    return auditVal.length > currentVal.length;
  }
  if (typeof auditVal === "object" && typeof currentVal === "object" && !Array.isArray(auditVal)) {
    const auditJson = JSON.stringify(auditVal);
    const curJson = JSON.stringify(currentVal);
    if (auditJson !== curJson && isEmpty(currentVal)) return true;
    if (field === "asIsStack" || field === "changePains" || field === "competitorEntries") {
      for (const [k, v] of Object.entries(auditVal)) {
        const cur = currentVal[k];
        if (hasMeaningfulAuditValue(field === "changePains" ? "changePains" : field, v) && isEmpty(cur)) return true;
      }
    }
  }
  return false;
}

function mergeField(field, auditVal, currentVal) {
  if (isEmpty(currentVal)) return auditVal;
  if (field === "projectTasks" && Array.isArray(auditVal) && Array.isArray(currentVal)) {
    const merged = [...currentVal];
    for (const t of auditVal) if (t && !merged.includes(t)) merged.push(t);
    return merged;
  }
  if (typeof auditVal === "object" && typeof currentVal === "object" && !Array.isArray(auditVal)) {
    const out = { ...currentVal };
    for (const [k, v] of Object.entries(auditVal)) {
      if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v;
      else if (field === "competitorEntries" && Array.isArray(v) && Array.isArray(out[k])) {
        out[k] = [...(out[k] || []), ...v];
      }
    }
    return out;
  }
  return auditVal;
}

async function applyDealPatch(dealId, patches) {
  const deal = await loadDealByBusinessId(dealId);
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  for (const [field, val] of Object.entries(patches)) {
    if (TECH_FIELDS.has(field)) {
      deal.techResearch = deal.techResearch || {};
      deal.techResearch[field] = val;
    } else if (field === "riskTypes") {
      deal.riskTypes = val;
    } else {
      deal[field] = val;
    }
  }

  const pbDeal = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  if (!pbDeal) throw new Error(`PB deal missing: ${dealId}`);

  const { upsertDeal } = require("./src/mapper");
  await upsertDeal(deal);
  return deal;
}

async function main() {
  const opts = parseArgs();
  console.log(`Since: ${opts.since} | dryRun: ${opts.dryRun}`);

  const rows = await listAll("audit_log", {
    filter: `at >= "${opts.since}"`,
    sort: "-at",
    perPage: 500,
  });
  const filtered = rows.filter(r => MANAGERS.includes(r.saved_by) && !r.is_new_deal);
  console.log(`Audit rows: ${rows.length}, by target managers: ${filtered.length}`);

  const byDealField = {};
  for (const r of filtered) {
    const field = LABEL_TO_FIELD[r.label];
    if (!field || !r.deal_id) continue;
    const key = `${r.deal_id}::${field}`;
    if (!byDealField[key] || r.at > byDealField[key].at) {
      byDealField[key] = r;
    }
  }

  const dealPatches = {};
  const report = [];

  for (const [key, row] of Object.entries(byDealField)) {
    const [dealId, field] = key.split("::");
    const auditVal = parseAuditValue(field, row.new_value);
    let deal;
    try {
      deal = await loadDealByBusinessId(dealId);
    } catch (e) {
      report.push({ dealId, customer: row.customer, field, status: "load_error", error: e.message });
      continue;
    }
    if (!deal) continue;

    const currentVal = currentFieldValue(deal, field);
    if (!shouldRestore(field, auditVal, currentVal)) continue;

    const merged = mergeField(field, auditVal, currentVal);
    if (!dealPatches[dealId]) dealPatches[dealId] = { customer: row.customer, savedBy: row.saved_by, fields: {} };
    dealPatches[dealId].fields[field] = merged;
    report.push({
      dealId,
      customer: row.customer,
      owner: row.owner,
      savedBy: row.saved_by,
      at: row.at,
      field,
      label: row.label,
      auditPreview: String(row.new_value).slice(0, 200),
      currentPreview: JSON.stringify(currentVal).slice(0, 200),
      restorePreview: JSON.stringify(merged).slice(0, 200),
      status: "needs_restore",
    });
  }

  console.log(`\n=== RESTORE CANDIDATES: ${report.length} ===`);
  for (const r of report) {
    console.log(`\n${r.dealId} ${r.customer} [${r.savedBy} @ ${r.at}]`);
    console.log(`  ${r.label}: ${r.auditPreview}`);
    console.log(`  current: ${r.currentPreview}`);
    console.log(`  -> restore: ${r.restorePreview}`);
  }

  if (!opts.apply) {
    console.log(`\nDry run only. Re-run with --apply to write ${Object.keys(dealPatches).length} deals.`);
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const [dealId, info] of Object.entries(dealPatches)) {
    try {
      await applyDealPatch(dealId, info.fields);
      console.log(`APPLIED ${dealId} ${info.customer}: ${Object.keys(info.fields).join(", ")}`);
      ok++;
    } catch (e) {
      console.error(`FAILED ${dealId}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} applied, ${fail} failed`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
