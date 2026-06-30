#!/usr/bin/env node
"use strict";
const { listAll, findOne } = require("../src/pb-client");
const { loadPipelineState } = require("../src/mapper");

const dealId = process.argv[2] || "D-154";

(async () => {
  const deal = await loadPipelineState({ dealId });
  console.log("=== DEAL", dealId, deal?.customer, "===");
  console.log("projectTasks:", JSON.stringify(deal?.techResearch?.projectTasks));
  console.log("seekingSegments:", JSON.stringify(deal?.techResearch?.seekingSegments));
  console.log("asIsStack:", JSON.stringify(deal?.techResearch?.asIsStack));
  console.log("changePains:", JSON.stringify(deal?.techResearch?.changePains));
  console.log("commitStatus:", deal?.commitStatus);
  console.log("riskTypes:", deal?.riskTypes);
  console.log("riskComment:", deal?.riskComment);

  const pb = await findOne("deals", `deal_id="${dealId}"`);
  if (pb) {
    const tasks = await listAll("deal_project_tasks", { filter: `deal="${pb.id}"` });
    console.log("PB deal_project_tasks rows:", tasks.length, tasks.map(t => t.task));
    const acts = await listAll("deal_activities", { filter: `deal="${pb.id}"`, sort: "-activity_at", perPage: 20 });
    console.log("\n=== ACTIVITIES ===");
    acts.forEach(a => console.log(a.activity_at, "[" + a.author + "]", a.activity_type, (a.body || "").slice(0, 120)));
  }

  const audit = await listAll("audit_log", { filter: `deal_id="${dealId}"`, sort: "-at", perPage: 30 });
  console.log("\n=== RECENT AUDIT ===");
  audit.forEach(r => console.log(r.at, "[" + r.saved_by + "]", r.label, ":", (r.old_value || "").slice(0, 40), "->", (r.new_value || "").slice(0, 120)));
})().catch(e => { console.error(e); process.exit(1); });
