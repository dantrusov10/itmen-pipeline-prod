#!/usr/bin/env node
"use strict";

const { getAccessToken, amoGetAll } = require("../api/src/amo-client");

const IDS = ["13297858", "13526614"];

(async () => {
  const token = await getAccessToken();
  const users = await amoGetAll("/api/v4/users", token);
  console.log("live users count:", users.length);
  for (const id of IDS) {
    const hit = users.find(u => String(u.id) === id);
    console.log("live", id, hit ? [hit.name, hit.last_name].filter(Boolean).join(" ") : "(absent)");
  }
  for (const id of IDS) {
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[responsible_user_id]": id, limit: 1 });
    console.log("leads with owner", id, ":", leads.length > 0 ? "yes (has leads)" : "none in sample");
  }
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
