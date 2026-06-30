"use strict";

const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { findOne } = require("/opt/itmen-pipeline/api/src/pb-client");
const { syncLeadNotesAndTasks } = require("/opt/itmen-pipeline/api/src/amo-lead-sync");

async function main() {
  const dealId = process.argv[2] || "D-1009";
  const row = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  if (!row?.amo_id) throw new Error(`No amo_id for ${dealId}`);
  const token = await getAccessToken();
  const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": row.amo_id, with: "contacts" });
  const lead = leads[0];
  if (!lead) throw new Error(`Lead ${row.amo_id} not found in Amo`);
  await syncLeadNotesAndTasks({ lead, token, dealId, pbId: row.id });
  console.log("resynced", dealId, "amo", row.amo_id);
}

main().catch(e => { console.error(e); process.exit(1); });
