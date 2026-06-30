"use strict";
const { listAll } = require("/opt/itmen-pipeline/api/src/pb-client");

(async () => {
  const rows = await listAll("deals", { sort: "deal_id" });
  const hits = rows.filter(r =>
    /трусов/i.test(String(r.owner || ""))
    || /трусов/i.test(String(r.presale_owner || ""))
    || /трусов/i.test(String(r.capabilities || ""))
  ).map(r => ({
    id: r.deal_id,
    owner: r.owner,
    presale_owner: r.presale_owner,
    capabilities: String(r.capabilities || "").slice(0, 80),
    stage: r.stage,
    presale_stage: r.presale_stage,
  }));
  console.log(JSON.stringify({ count: hits.length, hits: hits.slice(0, 20) }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
