"use strict";

const { listAll, createRecord, updateRecord, deleteRecord } = require("./pb-client");
const { loadPipelineState } = require("./mapper");
const { listAllTasks } = require("./deal-crm");

const ENTITY_FIELDS = {
  deals: [
    "id", "customer", "owner", "stage", "industry", "amount", "expectedBudget",
    "partner", "budgetStatus", "budgetPeriod", "taskDue", "lossReason", "archived",
  ],
  tasks: ["id", "dealId", "title", "assignee", "dueAt", "status", "customer", "owner"],
  activities: ["id", "dealId", "type", "body", "author", "at"],
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

function applyFilters(rows, filters, entity) {
  let out = rows;
  for (const [key, val] of Object.entries(filters || {})) {
    if (val == null || val === "") continue;
    if (Array.isArray(val)) {
      out = out.filter(r => val.includes(r[key]));
    } else if (typeof val === "object" && val.min != null) {
      out = out.filter(r => (r[key] || 0) >= val.min);
    } else if (typeof val === "object" && val.max != null) {
      out = out.filter(r => (r[key] || 0) <= val.max);
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
    const state = await loadPipelineState({ lite: true });
    rows = (state?.deals || []).filter(d => !d.archived);
  } else if (entity === "tasks") {
    rows = await listAllTasks({});
  } else if (entity === "activities") {
    const acts = await listAll("deal_activities", { sort: "-activity_at", perPage: 500 });
    const dealRows = await listAll("deals", { fields: "id,deal_id" });
    const dm = Object.fromEntries(dealRows.map(d => [d.id, d.deal_id]));
    rows = acts.map(a => ({
      id: a.id,
      dealId: dm[a.deal] || "",
      type: a.activity_type,
      body: (a.body || "").slice(0, 200),
      author: a.author,
      at: a.activity_at,
    }));
  }
  rows = applyFilters(rows, filters, entity);
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
