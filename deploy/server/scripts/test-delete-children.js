"use strict";
const { deleteByFilter, listAll } = require("/opt/itmen-pipeline/api/src/pb-client");

async function main() {
  const pb = process.argv[2] || "xgyaq948xg76nb4";
  const histories = await listAll("deal_score_history", { filter: `deal="${pb}"` });
  for (const h of histories) {
    try {
      const n = await deleteByFilter("deal_score_history_items", `history="${h.id}"`);
      console.log("history_items", h.id, n);
    } catch (e) {
      console.log("history_items ERR", h.id, e.message, e.status);
    }
  }
  const cols = [
    "deal_score_history", "deal_scores", "deal_risks", "deal_competitors",
    "deal_change_pains", "deal_as_is", "deal_project_tasks", "deal_seeking_segments",
    "deal_tech", "pilot_requirements", "product_requirements",
  ];
  for (const c of cols) {
    try {
      const n = await deleteByFilter(c, `deal="${pb}"`);
      console.log(c, "deleted", n);
    } catch (e) {
      console.log(c, "ERR", e.message, e.status);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
