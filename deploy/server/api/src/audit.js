"use strict";

const { createRecord } = require("./pb-client");
const { FIELD_LABELS } = require("./audit-labels");

const SCALAR_FIELDS = [
  "customer", "industry", "owner", "stage", "amount", "expectedBudget",
  "partner", "partnerDiscount", "clientDiscount", "manualProb", "taskDue",
  "budgetPeriod", "budgetStatus", "budgetPlannedMonth", "budgetPlannedYear",
  "commitStatus", "pains", "riskComment",
];

const AUDIT_VALUE_MAX = 4000;

function normalizeRiskTypes(deal) {
  if (!deal) return [];
  if (deal.riskTypes?.length) return deal.riskTypes.filter(r => r && r !== "none");
  if (deal.riskType && deal.riskType !== "none") return [deal.riskType];
  return [];
}

function normalizeManualProb(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 1) return Math.min(1, n);
  if (n <= 100) return Math.min(1, n / 100);
  let x = n;
  while (x > 100) x /= 100;
  return Math.min(1, x / 100);
}

function formatAuditValue(key, val) {
  if (val === null || val === undefined || val === "") return "";
  if (key === "manualProb") {
    const p = normalizeManualProb(val);
    return p > 0 ? `${Math.round(p * 100)}%` : "";
  }
  if (key === "amount" || key === "expectedBudget") {
    const n = Number(val);
    if (!Number.isFinite(n)) return "";
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
  }
  if (key === "riskTypes" || key === "seekingSegments") {
    return (Array.isArray(val) ? val : []).join(", ");
  }
  if (key === "projectTasks") {
    return (Array.isArray(val) ? val : []).join("; ");
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function truncate(s) {
  const str = s == null ? "" : String(s);
  return str.length <= AUDIT_VALUE_MAX ? str : `${str.slice(0, AUDIT_VALUE_MAX)}…`;
}

const SCORE_KEYS = [
  "loyalty", "commit", "budget", "fit", "timing", "competitive", "access", "technical", "commercial",
];

function normalizeAuditScalar(key, val) {
  if (key === "budgetStatus") {
    const s = String(val || "").trim();
    return s || "Неизвестно";
  }
  if (key === "budgetPeriod") {
    const s = String(val || "").trim();
    return s || "Не определён";
  }
  if (key === "commitStatus") {
    const s = String(val || "").trim();
    return s || "none";
  }
  return val;
}

function normalizeScoresJson(scores) {
  const out = {};
  for (const k of SCORE_KEYS) out[k] = Number(scores?.[k]) || 0;
  return JSON.stringify(out);
}

function diffDeal(oldD, newD) {
  const changes = [];
  for (const key of SCALAR_FIELDS) {
    const o = formatAuditValue(key, normalizeAuditScalar(key, oldD?.[key]));
    const n = formatAuditValue(key, normalizeAuditScalar(key, newD?.[key]));
    if (o !== n) changes.push({ field: key, label: FIELD_LABELS[key] || key, old: o, new: n });
  }

  const oRisks = formatAuditValue("riskTypes", normalizeRiskTypes(oldD));
  const nRisks = formatAuditValue("riskTypes", normalizeRiskTypes(newD));
  if (oRisks !== nRisks) {
    changes.push({ field: "riskTypes", label: FIELD_LABELS.riskTypes, old: oRisks, new: nRisks });
  }

  const oScores = normalizeScoresJson(oldD?.scores);
  const nScores = normalizeScoresJson(newD?.scores);
  if (oScores !== nScores) {
    changes.push({ field: "scores", label: FIELD_LABELS.scores, old: oScores, new: nScores });
  }

  const otr = oldD?.techResearch || {};
  const ntr = newD?.techResearch || {};
  const techKeys = [
    "seekingSegments", "seekingOtherLabel", "productRequirementsPct",
    "pilotRequirementsPct", "asIsStack", "changePains", "competitorEntries", "projectTasks",
  ];
  for (const key of techKeys) {
    const o = formatAuditValue(key, otr[key]);
    const n = formatAuditValue(key, ntr[key]);
    if (o !== n) changes.push({ field: key, label: FIELD_LABELS[key] || key, old: o, new: n });
  }
  return changes;
}

async function writeDealAudit({ savedBy, oldDeal, newDeal, isNew = false }) {
  const at = new Date().toISOString();
  const rows = [];

  if (isNew || !oldDeal) {
    rows.push({
      at,
      saved_by: savedBy,
      deal_id: newDeal.id,
      customer: newDeal.customer || "",
      owner: newDeal.owner || "",
      change_count: 1,
      label: "—",
      old_value: "",
      new_value: "Новая сделка",
      is_new_deal: true,
    });
  } else {
    const changes = diffDeal(oldDeal, newDeal);
    for (const ch of changes) {
      rows.push({
        at,
        saved_by: savedBy,
        deal_id: newDeal.id,
        customer: newDeal.customer || "",
        owner: newDeal.owner || "",
        change_count: changes.length,
        label: ch.label,
        old_value: truncate(ch.old),
        new_value: truncate(ch.new),
        is_new_deal: false,
      });
    }
  }

  for (const row of rows) {
    await createRecord("audit_log", row);
  }
  return rows.length;
}

module.exports = { diffDeal, writeDealAudit };
