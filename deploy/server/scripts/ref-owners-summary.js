"use strict";
const { listAll } = require("/opt/itmen-pipeline/api/src/pb-client");
(async () => {
  const rows = await listAll("deals", { filter: 'deal_type~"ref:"', fields: "deal_id,amo_id,owner,deal_type" });
  const withAmo = rows.filter(r => Number(r.amo_id) > 0);
  const owners = {};
  rows.forEach(r => {
    const o = r.owner || "(empty)";
    owners[o] = (owners[o] || 0) + 1;
  });
  console.log(JSON.stringify({ total: rows.length, withAmo: withAmo.length, owners }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
