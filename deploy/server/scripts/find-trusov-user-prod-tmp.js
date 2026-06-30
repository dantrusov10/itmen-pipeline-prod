"use strict";
const { listAll } = require("/opt/itmen-pipeline/api/src/pb-client");

(async () => {
  const users = await listAll("pipeline_users", { sort: "email" });
  const hits = users.filter(u =>
    /трусов/i.test(String(u.display_name || ""))
    || /трусов/i.test(String(u.manager_name || ""))
    || /трусов/i.test(String(u.email || ""))
  ).map(u => ({
    email: u.email,
    role: u.role,
    display_name: u.display_name,
    manager_name: u.manager_name,
    roles: u.roles,
  }));
  console.log(JSON.stringify(hits, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
