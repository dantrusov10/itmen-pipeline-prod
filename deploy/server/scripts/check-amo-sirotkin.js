#!/usr/bin/env node
"use strict";

const { getAccessToken, amoGetAll } = require("../api/src/amo-client");
const { ensureAmoUsers, buildAmoIdToCrmMap } = require("../api/src/amo-users");

(async () => {
  const token = await getAccessToken();
  await ensureAmoUsers(token);
  const { map } = await buildAmoIdToCrmMap(token);
  const ids = ["13297858", "13526614"];
  for (const id of ids) {
    const users = await amoGetAll("/api/v4/users", token, { "filter[id]": id });
    const u = users[0];
    const amoName = u ? [u.name, u.last_name].filter(Boolean).join(" ").trim() : "(not in API)";
    console.log(JSON.stringify({
      id,
      amoName,
      email: u?.email || "",
      is_active: u?.rights?.is_active ?? u?.is_active,
      crmMap: map[id] || "",
    }));
  }
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
