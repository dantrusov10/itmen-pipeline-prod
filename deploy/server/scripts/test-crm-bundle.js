"use strict";
const { getDealCrmBundle } = require("/opt/itmen-pipeline/api/src/deal-crm");
const dealId = process.argv[2] || "D-1009";
getDealCrmBundle(dealId).then(r => {
  console.log(JSON.stringify({
    activities: r.activities.length,
    tasks: r.tasks.length,
    sample: r.activities.slice(0, 3).map(a => ({ type: a.type, author: a.author, body: (a.body || "").slice(0, 40) })),
    tasksSample: r.tasks.slice(0, 3).map(t => ({ title: t.title, status: t.status, assignee: t.assignee })),
  }, null, 2));
}).catch(e => { console.error(e); process.exit(1); });
