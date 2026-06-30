#!/usr/bin/env node
"use strict";

const { getAccessToken, amoGetAll } = require("../api/src/amo-client");

(async () => {
  const token = await getAccessToken();
  const users = await amoGetAll("/api/v4/users", token);
  const ids = new Set(["13297858", "13526614"]);
  const byName = users.filter(u => {
    const n = [u.name, u.last_name, u.email].filter(Boolean).join(" ").toLowerCase();
    return n.includes("сироткин") || n.includes("sirot");
  });
  const byId = users.filter(u => ids.has(String(u.id)));
  console.log("total users", users.length);
  console.log("by name", JSON.stringify(byName.map(u => ({
    id: u.id,
    name: [u.name, u.last_name].filter(Boolean).join(" "),
    email: u.email || "",
  })), null, 2));
  console.log("by id", JSON.stringify(byId.map(u => ({
    id: u.id,
    name: [u.name, u.last_name].filter(Boolean).join(" "),
    email: u.email || "",
  })), null, 2));
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
