"use strict";

const {
  listAll, findOne, createRecord, updateRecord, deleteByFilter,
} = require("./pb-client");

const FEAS_SCORE_MAP = {
  "полностью": 1.0,
  "частично": 0.6,
  "нет": 0.0,
  "нет возможности": 0.0,
  "хард код (скоро)": 0.7,
  "хард код (не скоро)": 0.3,
  "требуется скрипт": 0.5,
};

const FEASIBILITY_OPTIONS = [
  "—", "Полностью", "Частично", "Нет", "Нет возможности",
  "Хард код (скоро)", "Хард код (не скоро)", "Требуется скрипт",
];

const PILOT_REQ_TYPES = ["Тех", "ИБ", "Бизнес", "Интеграции", "Отчеты"];

function feasibilityScore(label) {
  if (!label || label === "—") return null;
  const k = String(label).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FEAS_SCORE_MAP, k) ? FEAS_SCORE_MAP[k] : null;
}

function computeFeasibilityPct(rows, mode) {
  const scores = [];
  for (const r of rows) {
    if (mode === "pilot") {
      if (!String(r.client_requirement || "").trim() && !String(r.business_need || "").trim()) continue;
    } else if (!String(r.functional_requirement || "").trim() && !String(r.business_requirement || "").trim()) {
      continue;
    }
    const s = r.feasibility_score != null ? Number(r.feasibility_score) : feasibilityScore(r.feasibility);
    if (s != null && !Number.isNaN(s)) scores.push(s);
  }
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}

async function resolveDealPbId(dealId) {
  const row = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  return row?.id || null;
}

function normalizePilotRowData(row) {
  let businessNeed = row.business_need || "";
  let verificationMetric = row.verification_metric || "";
  let owner = row.owner || "";
  if (!businessNeed && owner && owner.length > 15 && !owner.includes("@")) {
    businessNeed = owner;
    owner = "";
  }
  if (!verificationMetric && owner && owner.length <= 80) {
    verificationMetric = owner;
    owner = "";
  }
  return { businessNeed, verificationMetric, owner };
}

function mapPilotRow(row, dealId) {
  const norm = normalizePilotRowData(row);
  return {
    id: row.id,
    dealId,
    sortOrder: row.sort_order ?? 0,
    businessNeed: norm.businessNeed,
    clientRequirement: row.client_requirement || "",
    reqType: row.req_type || "Тех",
    isMandatory: Boolean(row.is_mandatory),
    feasibility: row.feasibility || "—",
    feasibilityScore: row.feasibility_score,
    verificationMetric: norm.verificationMetric,
    owner: norm.owner,
    source: row.source || "",
    legacyRunId: row.legacy_run_id || "",
    updatedBy: row.updated_by || "",
  };
}

function mapProductRow(row, dealId) {
  return {
    id: row.id,
    dealId,
    sortOrder: row.sort_order ?? 0,
    businessRequirement: row.business_requirement || "",
    functionalRequirement: row.functional_requirement || "",
    reqType: row.req_type || "Тех",
    isMandatory: Boolean(row.is_mandatory),
    feasibility: row.feasibility || "—",
    feasibilityScore: row.feasibility_score,
    source: row.source || "",
    legacyRunId: row.legacy_run_id || "",
    updatedBy: row.updated_by || "",
  };
}

async function listPilotRequirements(dealId) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) return { rows: [], feasibilityPct: null, count: 0 };
  const deal = await findOne("deals", `id="${pbId}"`);
  const rows = await listAll("pilot_requirements", {
    filter: `deal="${pbId}"`,
    sort: "sort_order,created",
  });
  const computed = rows.length ? computeFeasibilityPct(rows, "pilot") : null;
  const feasibilityPct = computed ?? (deal?.pilot_feasibility_pct != null ? deal.pilot_feasibility_pct : null);
  return {
    rows: rows.map(r => mapPilotRow(r, dealId)),
    feasibilityPct,
    count: deal?.pilot_req_count ?? rows.length,
    updatedAt: deal?.requirements_updated_at || null,
  };
}

async function listProductRequirements(dealId) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) return { rows: [], feasibilityPct: null, count: 0 };
  const deal = await findOne("deals", `id="${pbId}"`);
  const rows = await listAll("product_requirements", {
    filter: `deal="${pbId}"`,
    sort: "sort_order,created",
  });
  const computed = rows.length ? computeFeasibilityPct(rows, "product") : null;
  const feasibilityPct = computed ?? (deal?.product_feasibility_pct != null ? deal.product_feasibility_pct : null);
  return {
    rows: rows.map(r => mapProductRow(r, dealId)),
    feasibilityPct,
    count: deal?.product_req_count ?? rows.length,
    updatedAt: deal?.requirements_updated_at || null,
  };
}

function normalizePilotInput(row, i, updatedBy, source = "crm") {
  const feasibility = row.feasibility || "—";
  const score = row.feasibilityScore != null ? row.feasibilityScore : feasibilityScore(feasibility);
  return {
    sort_order: i,
    business_need: String(row.businessNeed || "").trim(),
    client_requirement: String(row.clientRequirement || "").trim(),
    req_type: row.reqType || "Тех",
    is_mandatory: row.isMandatory !== false,
    feasibility,
    feasibility_score: score,
    verification_metric: String(row.verificationMetric || "").trim(),
    owner: "",
    source,
    legacy_run_id: row.legacyRunId || "",
    updated_by: updatedBy || "",
  };
}

function normalizeProductInput(row, i, updatedBy, source = "crm") {
  const feasibility = row.feasibility || "—";
  const score = row.feasibilityScore != null ? row.feasibilityScore : feasibilityScore(feasibility);
  return {
    sort_order: i,
    business_requirement: String(row.businessRequirement || "").trim(),
    functional_requirement: String(row.functionalRequirement || "").trim(),
    req_type: row.reqType || "Тех",
    is_mandatory: row.isMandatory !== false,
    feasibility,
    feasibility_score: score,
    source,
    legacy_run_id: row.legacyRunId || "",
    updated_by: updatedBy || "",
  };
}

async function syncDealTechPct(pbDealId, pilotPct, productPct) {
  const techRows = await listAll("deal_tech", { filter: `deal="${pbDealId}"`, perPage: 1 });
  const body = {
    product_requirements_pct: productPct,
    pilot_requirements_pct: pilotPct,
  };
  if (techRows.length) {
    await updateRecord("deal_tech", techRows[0].id, body);
  } else {
    await createRecord("deal_tech", { deal: pbDealId, seeking_other_label: "", ...body });
  }
}

async function savePilotRequirements(dealId, rows, { updatedBy, source = "crm", skipIfExists = false } = {}) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");

  if (skipIfExists) {
    const existing = await listAll("pilot_requirements", { filter: `deal="${pbId}"`, perPage: 1 });
    if (existing.length) return listPilotRequirements(dealId);
  }

  const normalized = (rows || [])
    .map((r, i) => normalizePilotInput(r, i, updatedBy, source))
    .filter(r => r.business_need || r.client_requirement);

  await deleteByFilter("pilot_requirements", `deal="${pbId}"`);
  for (const row of normalized) {
    const payload = { deal: pbId, ...row };
    if (payload.feasibility_score == null) delete payload.feasibility_score;
    await createRecord("pilot_requirements", payload);
  }

  const pilotPct = computeFeasibilityPct(normalized, "pilot");
  const deal = await findOne("deals", `id="${pbId}"`);
  const productPct = deal?.product_feasibility_pct ?? null;
  const productCount = deal?.product_req_count ?? 0;

  await updateRecord("deals", pbId, {
    pilot_feasibility_pct: pilotPct,
    pilot_req_count: normalized.length,
    requirements_updated_at: new Date().toISOString(),
  });
  await syncDealTechPct(pbId, pilotPct, productPct);

  if (updatedBy) {
    const { addActivity } = require("./deal-crm");
    await addActivity(dealId, {
      type: "field_change",
      body: `Обновлены требования к пилоту (${normalized.length} поз.)`,
      author: updatedBy,
      meta: { requirements: "pilot", count: normalized.length },
    });
  }

  return {
    rows: normalized.map((r, i) => ({
      sortOrder: i,
      businessNeed: r.business_need,
      clientRequirement: r.client_requirement,
      reqType: r.req_type,
      isMandatory: r.is_mandatory,
      feasibility: r.feasibility,
      feasibilityScore: r.feasibility_score,
      verificationMetric: r.verification_metric,
      owner: r.owner,
      source: r.source,
    })),
    feasibilityPct: pilotPct,
    count: normalized.length,
    productFeasibilityPct: productPct,
    productReqCount: productCount,
  };
}

async function saveProductRequirements(dealId, rows, { updatedBy, source = "crm", skipIfExists = false } = {}) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");

  if (skipIfExists) {
    const existing = await listAll("product_requirements", { filter: `deal="${pbId}"`, perPage: 1 });
    if (existing.length) return listProductRequirements(dealId);
  }

  const normalized = (rows || [])
    .map((r, i) => normalizeProductInput(r, i, updatedBy, source))
    .filter(r => r.business_requirement || r.functional_requirement);

  await deleteByFilter("product_requirements", `deal="${pbId}"`);
  for (const row of normalized) {
    const payload = { deal: pbId, ...row };
    if (payload.feasibility_score == null) delete payload.feasibility_score;
    await createRecord("product_requirements", payload);
  }

  const productPct = computeFeasibilityPct(normalized, "product");
  const deal = await findOne("deals", `id="${pbId}"`);
  const pilotPct = deal?.pilot_feasibility_pct ?? null;
  const pilotCount = deal?.pilot_req_count ?? 0;

  await updateRecord("deals", pbId, {
    product_feasibility_pct: productPct,
    product_req_count: normalized.length,
    requirements_updated_at: new Date().toISOString(),
  });
  await syncDealTechPct(pbId, pilotPct, productPct);

  if (updatedBy) {
    const { addActivity } = require("./deal-crm");
    await addActivity(dealId, {
      type: "field_change",
      body: `Обновлены требования к продукту (${normalized.length} поз.)`,
      author: updatedBy,
      meta: { requirements: "product", count: normalized.length },
    });
  }

  return {
    rows: normalized.map((r, i) => ({
      sortOrder: i,
      businessRequirement: r.business_requirement,
      functionalRequirement: r.functional_requirement,
      reqType: r.req_type,
      isMandatory: r.is_mandatory,
      feasibility: r.feasibility,
      feasibilityScore: r.feasibility_score,
      source: r.source,
    })),
    feasibilityPct: productPct,
    count: normalized.length,
    pilotFeasibilityPct: pilotPct,
    pilotReqCount: pilotCount,
  };
}

module.exports = {
  FEASIBILITY_OPTIONS,
  PILOT_REQ_TYPES,
  feasibilityScore,
  computeFeasibilityPct,
  listPilotRequirements,
  listProductRequirements,
  savePilotRequirements,
  saveProductRequirements,
};
