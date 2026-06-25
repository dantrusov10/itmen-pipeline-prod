"use strict";

const { listAll, createRecord, updateRecord, deleteRecord } = require("./pb-client");
const { loadPipelineState } = require("./mapper");
const { listAllTasks } = require("./deal-crm");

const ENTITY_FIELDS = {
  deals: [
    "id", "customer", "owner", "stage", "industry", "amount", "expectedBudget",
    "partner", "partnerDiscount", "clientDiscount", "manualProb", "budgetStatus",
    "budgetPeriod", "budgetPlannedMonth", "budgetPlannedYear", "taskDue",
    "commitStatus", "lossReason", "archived", "pains", "capabilities", "dml",
    "nextStepType", "nextStepComment", "riskType", "riskComment", "competitors",
    "amoId", "lastUpdate", "dealType", "hasPains", "duplicate_of",
    "score", "category", "weighted", "quality", "daysTo", "daysSince",
    "commitLabel", "riskFlag", "productPct", "pilotPct",
  ],
  tasks: [
    "id", "dealId", "title", "description", "assignee", "dueAt", "doneAt",
    "reminderAt", "status", "customer", "owner", "createdBy",
  ],
  activities: [
    "id", "dealId", "type", "body", "author", "authorEmail", "at",
  ],
  contacts: [
    "id", "dealId", "name", "email", "phone", "role", "isPrimary",
  ],
  files: [
    "id", "dealId", "label", "originalName", "size", "uploadedBy", "uploadedAt",
  ],
  deal_info: [
    "dealId", "companyName", "companyInn", "companyKpp", "companyOgrn",
    "website", "sourceChannel", "utmSource", "utmMedium", "utmCampaign",
    "landingPage", "referrer",
  ],
};

function mapPreset(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name || "",
    entity: row.entity || "deals",
    columns: safeJson(row.columns_json),
    filters: safeJson(row.filters_json),
    groupBy: row.group_by || "",
    chartType: row.chart_type || "none",
    chartConfig: safeJson(row.chart_config_json),
    isShared: Boolean(row.is_shared),
  };
}

function safeJson(s) {
  if (!s) return {};
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s); } catch { return {}; }
}

async function listPresets(userId) {
  const rows = await listAll("report_presets", {
    filter: `user_id="${userId}" || is_shared=true`,
    sort: "name",
  });
  return rows.map(mapPreset);
}

async function savePreset(userId, preset) {
  const body = {
    user_id: userId,
    name: preset.name || "Отчёт",
    entity: preset.entity || "deals",
    columns_json: JSON.stringify(preset.columns || []),
    filters_json: JSON.stringify(preset.filters || {}),
    group_by: preset.groupBy || "",
    chart_type: preset.chartType || "none",
    chart_config_json: JSON.stringify(preset.chartConfig || {}),
    is_shared: Boolean(preset.isShared),
  };
  const row = preset.id
    ? await updateRecord("report_presets", preset.id, body)
    : await createRecord("report_presets", body);
  return mapPreset(row);
}

async function deletePreset(userId, presetId) {
  const rows = await listAll("report_presets", {
    filter: `id="${presetId}" && user_id="${userId}"`,
    perPage: 1,
  });
  if (rows[0]) await deleteRecord("report_presets", rows[0].id);
  return { ok: true };
}

function applyFilters(rows, filters) {
  let out = rows;
  const f = filters || {};
  const rangeKeys = new Set();
  Object.keys(f).forEach(k => {
    if (k.endsWith("__from") || k.endsWith("__to")) rangeKeys.add(k.replace(/__(from|to)$/, ""));
  });
  rangeKeys.forEach(key => {
    const from = f[`${key}__from`];
    const to = f[`${key}__to`];
    if ((from == null || from === "") && (to == null || to === "")) return;
    out = out.filter(r => {
      const raw = r[key];
      const n = raw == null || raw === "" ? null : Number(raw);
      if (n == null || !Number.isFinite(n)) return false;
      if (from !== "" && from != null && n < Number(from)) return false;
      if (to !== "" && to != null && n > Number(to)) return false;
      return true;
    });
  });
  for (const [key, val] of Object.entries(f)) {
    if (key.endsWith("__from") || key.endsWith("__to")) continue;
    if (val == null || val === "") continue;
    if (Array.isArray(val)) {
      if (!val.length) continue;
      out = out.filter(r => val.includes(String(r[key] ?? "—")));
    } else if (val === "1" || val === true) {
      out = out.filter(r => Boolean(r[key]));
    } else if (val === "0" || val === false) {
      out = out.filter(r => !r[key]);
    } else if (typeof val === "object") {
      const from = val.from ?? val.min;
      const to = val.to ?? val.max;
      if (from == null && to == null) continue;
      out = out.filter(r => {
        const n = Number(r[key]);
        if (!Number.isFinite(n)) return false;
        if (from != null && from !== "" && n < Number(from)) return false;
        if (to != null && to !== "" && n > Number(to)) return false;
        return true;
      });
    } else {
      out = out.filter(r => String(r[key] || "").toLowerCase().includes(String(val).toLowerCase()));
    }
  }
  return out;
}

function pickColumns(rows, columns) {
  const cols = columns?.length ? columns : Object.keys(rows[0] || {});
  return rows.map(r => {
    const o = {};
    for (const c of cols) o[c] = r[c];
    return o;
  });
}

function groupRows(rows, groupBy) {
  if (!groupBy) return null;
  const map = {};
  for (const r of rows) {
    const k = r[groupBy] ?? "—";
    if (!map[k]) map[k] = [];
    map[k].push(r);
  }
  return Object.entries(map).map(([key, items]) => ({
    key,
    count: items.length,
    sumAmount: items.reduce((s, x) => s + (Number(x.amount) || 0), 0),
  }));
}

async function runReport({ entity, columns, filters, groupBy }) {
  let rows = [];
  if (entity === "deals") {
    const st = await loadPipelineState({ lite: false });
    rows = (st?.deals || []).filter(d => !d.archived).map(d => ({
      ...d,
      score: typeof d.score === "number" ? d.score : null,
      category: d.category || "",
      weighted: d.weighted || 0,
      commitLabel: d.commitLabel || d.commitStatus || "",
    }));
  } else if (entity === "tasks") {
    rows = await listAllTasks({});
  } else if (entity === "activities") {
    const acts = await listAll("deal_activities", { sort: "-activity_at", perPage: 2000 });
    const dealRows = await listAll("deals", { fields: "id,deal_id,customer,owner" });
    const dm = Object.fromEntries(dealRows.map(d => [d.id, d.deal_id]));
    const dmeta = Object.fromEntries(dealRows.map(d => [d.deal_id, d]));
    rows = acts.map(a => ({
      id: a.id,
      dealId: dm[a.deal] || "",
      type: a.activity_type,
      body: a.body || "",
      author: a.author || "",
      authorEmail: a.author_email || "",
      at: a.activity_at || a.created,
      customer: dmeta[dm[a.deal]]?.customer || "",
      owner: dmeta[dm[a.deal]]?.owner || "",
    }));
  } else if (entity === "contacts") {
    const { listAll: la } = require("./pb-client");
    const recs = await la("deal_contacts", { sort: "sort_order" });
    const dealRows = await listAll("deals", { fields: "id,deal_id" });
    const dm = Object.fromEntries(dealRows.map(d => [d.id, d.deal_id]));
    rows = recs.map(c => ({
      id: c.id,
      dealId: dm[c.deal] || "",
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      role: c.role || "",
      isPrimary: Boolean(c.is_primary),
    }));
  } else if (entity === "files") {
    const recs = await listAll("deal_files", { sort: "-created" });
    const dealRows = await listAll("deals", { fields: "id,deal_id" });
    const dm = Object.fromEntries(dealRows.map(d => [d.id, d.deal_id]));
    rows = recs.map(f => ({
      id: f.id,
      dealId: dm[f.deal] || "",
      label: f.label || "",
      originalName: f.original_name || "",
      size: f.size || 0,
      uploadedBy: f.uploaded_by || "",
      uploadedAt: f.uploaded_at || "",
    }));
  } else if (entity === "deal_info") {
    const recs = await listAll("deal_info");
    const dealRows = await listAll("deals", { fields: "id,deal_id" });
    const dm = Object.fromEntries(dealRows.map(d => [d.id, d.deal_id]));
    rows = recs.map(i => ({
      dealId: dm[i.deal] || "",
      companyName: i.company_name || "",
      companyInn: i.company_inn || "",
      companyKpp: i.company_kpp || "",
      companyOgrn: i.company_ogrn || "",
      website: i.website || "",
      sourceChannel: i.source_channel || "",
      utmSource: i.utm_source || "",
      utmMedium: i.utm_medium || "",
      utmCampaign: i.utm_campaign || "",
      landingPage: i.landing_page || "",
      referrer: i.referrer || "",
    }));
  }
  rows = applyFilters(rows, filters);
  const grouped = groupRows(rows, groupBy);
  return {
    entity,
    fields: ENTITY_FIELDS[entity] || [],
    rows: pickColumns(rows, columns),
    grouped,
    total: rows.length,
  };
}

module.exports = {
  ENTITY_FIELDS,
  listPresets,
  savePreset,
  deletePreset,
  runReport,
};
