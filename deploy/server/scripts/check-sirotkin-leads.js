#!/usr/bin/env node
"use strict";

const { getAccessToken, amoGetAll } = require("../api/src/amo-client");

const IDS = ["13297858", "13526614"];

(async () => {
  const token = await getAccessToken();
  for (const id of IDS) {
    const leads = await amoGetAll("/api/v4/leads", token, {
      "filter[responsible_user_id]": id,
      limit: 3,
      with: "responsible_user",
    });
    console.log("\n=== owner id", id, "sample", leads.length, "===");
    for (const l of leads.slice(0, 2)) {
      const ru = l._embedded?.responsible_user || {};
      console.log(JSON.stringify({
        leadId: l.id,
        leadName: l.name,
        responsible_user_id: l.responsible_user_id,
        embeddedName: [ru.name, ru.last_name].filter(Boolean).join(" "),
        embeddedEmail: ru.email || "",
      }));
    }
  }
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
