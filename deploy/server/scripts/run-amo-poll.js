"use strict";
require("/opt/itmen-pipeline/api/src/amo-sync").pollAmoInbound()
  .then(r => { console.log(JSON.stringify(r, null, 2)); })
  .catch(e => { console.error(e); process.exit(1); });
