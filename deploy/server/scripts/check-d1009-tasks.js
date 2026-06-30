"use strict";
const { listTasks } = require("/opt/itmen-pipeline/api/src/deal-crm");
listTasks("D-1009")
  .then(t => console.log(JSON.stringify(t, null, 2)))
  .catch(e => { console.error(e); process.exit(1); });
