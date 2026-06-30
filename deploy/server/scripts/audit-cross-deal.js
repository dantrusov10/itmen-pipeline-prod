"use strict";
const { findOne, listAll } = require("/opt/itmen-pipeline/api/src/pb-client");
const { loadPresaleMap } = require("/opt/itmen-pipeline/api/src/presale-data");

async function main() {
  const dealId = process.argv[2] || "D-005";
  const row = await findOne("deals", `deal_id="${dealId.replace(/"/g, '\\"')}"`);
  const acts = row ? await listAll("deal_activities", { filter: `deal="${row.id}"`, sort: "-activity_at" }) : [];
  const actHits = acts.filter(a => /world class|D-192|27526047|kaiten/i.test(JSON.stringify(a)));
  const map = await loadPresaleMap();
  const ev = (map[dealId]?.events || []).filter(e => /world class|D-192|27526047|kaiten/i.test(JSON.stringify(e)));
  console.log(JSON.stringify({ dealId, actHits: actHits.slice(0, 8), presaleHits: ev.slice(0, 8) }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
