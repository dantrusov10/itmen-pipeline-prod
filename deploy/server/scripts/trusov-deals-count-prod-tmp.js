"use strict";
const { listAll } = require("/opt/itmen-pipeline/api/src/pb-client");

(async () => {
  const rows = await listAll("deals", { sort: "deal_id" });
  const mgr = rows.filter(r => /трусов/i.test(String(r.owner || "")));
  const pres = rows.filter(r => /трусов/i.test(String(r.presale_owner || "")));
  console.log(JSON.stringify({
    managerOwned: mgr.length,
    presaleOwned: pres.length,
    managerSample: mgr.slice(0, 10).map(r => ({ id: r.deal_id, stage: r.stage, presale_stage: r.presale_stage, presale_owner: r.presale_owner })),
  }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
