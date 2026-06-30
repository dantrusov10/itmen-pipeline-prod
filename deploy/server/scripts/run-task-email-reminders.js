"use strict";
require("/opt/itmen-pipeline/api/src/task-email-reminders").sendDueReminders()
  .then(r => { console.log(JSON.stringify(r, null, 2)); })
  .catch(e => { console.error(e); process.exit(1); });
