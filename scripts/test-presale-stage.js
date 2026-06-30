"use strict";
const { loadPipelineState } = require("../src/mapper");
const { getPresaleForDeal, patchPresaleDeal } = require("../src/presale-data");

async function main() {
  const dealId = process.argv[2] || "D-192";
  const newStage = process.argv[3] || "В процессе пилота";
  const deal = await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) throw new Error("not found");
  console.log("Before:", deal.stage, (await getPresaleForDeal(dealId, deal))?.stage);
  const presale = await patchPresaleDeal(dealId, { stage: newStage }, { savedBy: "test", syncSales: true, deal });
  const refreshed = await loadPipelineState({ dealId, includeArchived: true });
  console.log("After presale:", presale.stage);
  console.log("After deal stage:", refreshed.stage);
}

main().catch(e => { console.error(e); process.exit(1); });
