"use strict";
const { findOne } = require("/opt/itmen-pipeline/api/src/pb-client");
const { getPresaleForDeal } = require("/opt/itmen-pipeline/api/src/presale-data");

(async () => {
  for (const id of ["D-150", "D-192"]) {
    const row = await findOne("deals", `deal_id="${id}"`);
    const presale = await getPresaleForDeal(id, {
      stage: row?.stage,
      capabilities: row?.capabilities,
      presale_stage: row?.presale_stage,
      presale_owner: row?.presale_owner,
    });
    console.log(JSON.stringify({
      id,
      manager: row?.stage,
      presale_stage_row: row?.presale_stage || "",
      presale_owner_row: row?.presale_owner || "",
      presale_meta_stage: presale?.stage || "",
      presale_meta_owner: presale?.owner || "",
    }));
  }
})().catch(e => { console.error(e); process.exit(1); });
