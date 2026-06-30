"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");

async function main() {
  const token = await getAccessToken();
  const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": 45299833 });
  console.log(JSON.stringify(leads[0], null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
