"use strict";
const { listAll } = require("/opt/itmen-pipeline/api/src/pb-client");
const { loadPresaleMap } = require("/opt/itmen-pipeline/api/src/presale-data");

async function main() {
  const dealId = process.argv[2] || "D-005";
  const row = await listAll("presale_events", { filter: `deal_id="${dealId}"`, sort: "-event_at" });
  const hits = row.filter(e => /world class|D-192|27526047/i.test(JSON.stringify(e)));
  console.log(JSON.stringify({ dealId, total: row.length, crossHits: hits.slice(0, 10) }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
