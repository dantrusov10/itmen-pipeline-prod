"use strict";
const { loadPresaleMap } = require("/opt/itmen-pipeline/api/src/presale-data");

(async () => {
  const map = await loadPresaleMap();
  const hits = Object.entries(map)
    .filter(([, p]) => /трусов/i.test(String(p?.owner || "")))
    .map(([id, p]) => ({ id, owner: p.owner, stage: p.stage }));
  console.log(JSON.stringify({ count: hits.length, hits: hits.slice(0, 30) }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
