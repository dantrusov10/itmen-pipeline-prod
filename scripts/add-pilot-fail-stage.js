"use strict";
const { listAll, createRecord } = require("../src/pb-client");

async function main() {
  const rows = await listAll("list_items", { filter: 'list_key="stages"', sort: "sort_order" });
  console.log("Current:", rows.map(r => r.value).join(" | "));
  if (rows.some(r => r.value === "Провал пилота")) {
    console.log("OK: already exists");
    return;
  }
  const after = rows.find(r => r.value === "Пилот Окончен");
  const sort = after ? (after.sort_order || 0) + 1 : rows.length;
  await createRecord("list_items", {
    list_key: "stages",
    value: "Провал пилота",
    sort_order: sort,
    active: true,
  });
  console.log("Added Провал пилота");
}

main().catch(e => { console.error(e); process.exit(1); });
