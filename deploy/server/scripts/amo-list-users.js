"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");

async function main() {
  const token = await getAccessToken();
  const users = await amoGetAll("/api/v4/users", token);
  console.log(JSON.stringify(users.map(u => ({
    id: u.id,
    name: [u.name, u.last_name].filter(Boolean).join(" "),
    email: u.email,
  })), null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
