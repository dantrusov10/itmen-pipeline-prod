"use strict";
const { loadPipelineState } = require("../src/mapper");
const { getPresaleForDeal } = require("../src/presale-data");

async function main() {
  const dealId = process.argv[2] || "d-192";
  const d = await loadPipelineState({ dealId, includeArchived: true });
  if (!d) {
    console.log("Deal not found:", dealId);
    return;
  }
  const p = await getPresaleForDeal(dealId, d);
  console.log(JSON.stringify({
    id: d.id,
    customer: d.customer,
    stage: d.stage,
    owner: d.owner,
    presale: {
      stage: p?.stage,
      owner: p?.owner,
      successWithoutPilot: p?.successWithoutPilot,
      lossReason: p?.lossReason,
      salesRejectMode: p?.salesRejectMode,
    },
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
