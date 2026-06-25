"use strict";

const { listAll, findOne, updateRecord, createRecord } = require("./pb-client");

function mapScoringRow(r) {
  return {
    id: r.id,
    key: r.criterion_key,
    name: r.name,
    weight: r.weight ?? 0,
    col: r.col || "—",
    owner: r.owner || "—",
    question: r.question || "",
    manualOnly: Boolean(r.manual_only),
    s5: r.rubric_s5 || "",
    s4: r.rubric_s4 || "",
    s3: r.rubric_s3 || "",
    s2: r.rubric_s2 || "",
    s1: r.rubric_s1 || "",
    s0: r.rubric_s0 || "",
    sortOrder: r.sort_order ?? 0,
  };
}

function rowFromItem(item, sortOrder) {
  return {
    criterion_key: item.key || item.criterion_key,
    name: item.name || "",
    weight: Number(item.weight) || 0,
    col: item.col || "—",
    owner: item.owner || "—",
    question: item.question || "",
    manual_only: Boolean(item.manualOnly),
    rubric_s5: item.s5 || "",
    rubric_s4: item.s4 || "",
    rubric_s3: item.s3 || "",
    rubric_s2: item.s2 || "",
    rubric_s1: item.s1 || "",
    rubric_s0: item.s0 || "",
    sort_order: sortOrder,
  };
}

async function listScoringCriteria() {
  const rows = await listAll("scoring_criteria", { sort: "sort_order" });
  return rows.map(mapScoringRow);
}

async function saveScoringCriteria(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Пустой список критериев");
  const saved = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = String(item.key || item.criterion_key || "").trim();
    if (!key) throw new Error(`Критерий #${i + 1}: нет ключа`);
    const body = rowFromItem({ ...item, key }, i);
    let row = await findOne("scoring_criteria", `criterion_key="${key.replace(/"/g, '\\"')}"`);
    if (row) {
      row = await updateRecord("scoring_criteria", row.id, body);
    } else {
      row = await createRecord("scoring_criteria", body);
    }
    saved.push(mapScoringRow(row));
  }
  return saved;
}

module.exports = { listScoringCriteria, saveScoringCriteria, mapScoringRow };
