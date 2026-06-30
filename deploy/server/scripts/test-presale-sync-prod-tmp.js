"use strict";
const { findOne } = require("/opt/itmen-pipeline/api/src/pb-client");
const { patchPresaleDeal, getPresaleForDeal } = require("/opt/itmen-pipeline/api/src/presale-data");
const { loadPipelineState } = require("/opt/itmen-pipeline/api/src/mapper");

(async () => {
  const dealId = "D-150";
  const before = await loadPipelineState({ dealId, includeArchived: true });
  console.log("before", { manager: before.stage, presale: before.presale_stage, presaleMeta: (await getPresaleForDeal(dealId, before))?.stage });

  const presale = await patchPresaleDeal(dealId, { stage: "Ожидаем отчет по итогам" }, { savedBy: "test", syncSales: true, deal: before });
  const after = await loadPipelineState({ dealId, includeArchived: true });
  console.log("after presale->ожидаем", { manager: after.stage, presale: after.presale_stage, presaleMeta: presale.stage });

  const presale2 = await patchPresaleDeal(dealId, { stage: "В процессе пилота" }, { savedBy: "test", syncSales: true, deal: after });
  const after2 = await loadPipelineState({ dealId, includeArchived: true });
  console.log("after presale->пилот", { manager: after2.stage, presale: after2.presale_stage, presaleMeta: presale2.stage });

  // restore
  await patchPresaleDeal(dealId, { stage: "Успех пилота" }, { savedBy: "test-restore", syncSales: true, deal: after2 });
  const restored = await loadPipelineState({ dealId, includeArchived: true });
  console.log("restored", { manager: restored.stage, presale: restored.presale_stage });
})().catch(e => { console.error(e); process.exit(1); });
