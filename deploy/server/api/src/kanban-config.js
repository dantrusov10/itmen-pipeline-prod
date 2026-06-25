"use strict";

const { listAll, findOne, createRecord, updateRecord } = require("./pb-client");

const CONFIG_KEY = "kanban_stages";

async function getKanbanConfig() {
  const rows = await listAll("list_items", { filter: `list_key="${CONFIG_KEY}"`, sort: "sort_order" });
  if (!rows.length) return { stages: null };
  try {
    const stages = JSON.parse(rows[0].value || "null");
    return { stages: Array.isArray(stages) ? stages : null };
  } catch (_) {
    return { stages: null };
  }
}

async function saveKanbanConfig(stages) {
  if (!Array.isArray(stages)) throw new Error("Ожидается массив стадий");
  const value = JSON.stringify(stages);
  let row = await findOne("list_items", `list_key="${CONFIG_KEY}"`);
  if (row) {
    await updateRecord("list_items", row.id, { value, sort_order: 0, active: true });
  } else {
    await createRecord("list_items", {
      list_key: CONFIG_KEY,
      value,
      sort_order: 0,
      active: true,
    });
  }
  return { stages };
}

module.exports = { getKanbanConfig, saveKanbanConfig };
