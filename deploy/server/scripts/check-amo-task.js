"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { resolveCrmPersonFromAmo } = require("/opt/itmen-pipeline/api/src/amo-users");

async function main() {
  const token = await getAccessToken();
  const users = await amoGetAll("/api/v4/users", token);
  const u = users.find(x => String(x.id) === "12718890");
  console.log("user", u ? `${u.name} ${u.last_name}` : "NOT FOUND");
  const name = await resolveCrmPersonFromAmo("12718890", token);
  console.log("resolved", name);
  const tasks = await amoGetAll("/api/v4/tasks", token, {
    "filter[id]": 56393909,
  });
  console.log("task", JSON.stringify(tasks[0], null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
