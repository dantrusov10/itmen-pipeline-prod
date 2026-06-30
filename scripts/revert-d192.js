"use strict";
const { loadPipelineState, saveSingleDeal } = require("../src/mapper");
const { patchPresaleDeal } = require("../src/presale-data");

async function main() {
  const dealId = "D-192";
  await patchPresaleDeal(dealId, { stage: "", successWithoutPilot: false }, { savedBy: "revert", syncSales: false });
  const d = await loadPipelineState({ dealId, includeArchived: true });
  await saveSingleDeal({ ...d, stage: "Пилот Окончен" }, { savedBy: "revert", isNew: false });
  console.log("reverted D-192");
}

main().catch(e => { console.error(e); process.exit(1); });
