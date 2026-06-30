"use strict";
const { findOne, updateRecord } = require("/opt/itmen-pipeline/api/src/pb-client");

async function main() {
  const taskId = "jhqbtvoy32gliqr";
  const row = await updateRecord("deal_tasks", taskId, {
    assignee: "Аркадий Мерлейн",
    due_at: "2026-06-25T18:00:00",
  });
  console.log(JSON.stringify(row, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
