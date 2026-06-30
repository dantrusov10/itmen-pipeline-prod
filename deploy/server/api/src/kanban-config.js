"use strict";

const { listAll, findOne, createRecord, updateRecord } = require("./pb-client");

const CONFIG_KEY = "kanban_stages";
const PRESALE_CONFIG_KEY = "presale_kanban_stages";
const PARTNER_CONFIG_KEY = "partner_kanban_stages";
const TECH_PARTNER_CONFIG_KEY = "tech_partner_kanban_stages";

async function getKanbanConfig(key = CONFIG_KEY) {
  const rows = await listAll("list_items", { filter: `list_key="${key}"`, sort: "sort_order" });
  if (!rows.length) return { stages: null };
  try {
    const stages = JSON.parse(rows[0].value || "null");
    return { stages: Array.isArray(stages) ? stages : null };
  } catch (_) {
    return { stages: null };
  }
}

async function syncStagesList(stages, listKey = "stages") {
  if (!Array.isArray(stages) || !stages.length) return;
  const existing = await listAll("list_items", { filter: `list_key="${listKey}"`, sort: "sort_order" });
  const byValue = new Map(existing.map(r => [r.value, r]));
  const keep = new Set();
  for (let i = 0; i < stages.length; i++) {
    const val = String(stages[i] || "").trim();
    if (!val) continue;
    keep.add(val);
    const row = byValue.get(val);
    if (row) {
      if ((row.sort_order || 0) !== i || row.active === false) {
        await updateRecord("list_items", row.id, { sort_order: i, active: true });
      }
    } else {
      await createRecord("list_items", {
        list_key: listKey,
        value: val,
        sort_order: i,
        active: true,
      });
    }
  }
  for (const row of existing) {
    if (keep.has(row.value)) continue;
    if (row.active !== false) {
      await updateRecord("list_items", row.id, { active: false });
    }
  }
}

async function resetSalesStagesLists() {
  const { CANONICAL_SALES_STAGES, KANBAN_VISIBLE_SALES_STAGES } = require("./sales-stages");
  await syncStagesList([...CANONICAL_SALES_STAGES], "stages");
  const value = JSON.stringify([...KANBAN_VISIBLE_SALES_STAGES]);
  let row = await findOne("list_items", 'list_key="kanban_stages"');
  if (row) {
    await updateRecord("list_items", row.id, { value, sort_order: 0, active: true });
  } else {
    await createRecord("list_items", {
      list_key: "kanban_stages",
      value,
      sort_order: 0,
      active: true,
    });
  }
  return { stages: KANBAN_VISIBLE_SALES_STAGES, allStages: CANONICAL_SALES_STAGES };
}

async function saveKanbanConfig(stages, opts = {}) {
  if (!Array.isArray(stages)) throw new Error("Ожидается массив стадий");
  const configKey = opts.configKey || CONFIG_KEY;
  const listKey = opts.listKey || (configKey === PRESALE_CONFIG_KEY ? "presale_stages" : "stages");
  const value = JSON.stringify(stages);
  let row = await findOne("list_items", `list_key="${configKey}"`);
  if (row) {
    await updateRecord("list_items", row.id, { value, sort_order: 0, active: true });
  } else {
    await createRecord("list_items", {
      list_key: configKey,
      value,
      sort_order: 0,
      active: true,
    });
  }
  const allStages = Array.isArray(opts.allStages) && opts.allStages.length ? opts.allStages : stages;
  const withTerminal = [...allStages];
  if (listKey === "stages" && !withTerminal.includes("Отказ")) withTerminal.push("Отказ");
  await syncStagesList(withTerminal, listKey);
  return { stages };
}

module.exports = {
  CONFIG_KEY,
  PRESALE_CONFIG_KEY,
  PARTNER_CONFIG_KEY,
  TECH_PARTNER_CONFIG_KEY,
  getKanbanConfig,
  saveKanbanConfig,
  syncStagesList,
  resetSalesStagesLists,
};
