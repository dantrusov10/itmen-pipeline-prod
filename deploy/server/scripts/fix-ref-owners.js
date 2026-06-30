"use strict";
const { listAll, updateRecord } = require("/opt/itmen-pipeline/api/src/pb-client");
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { resolveCrmPersonFromAmo } = require("/opt/itmen-pipeline/api/src/amo-users");

async function main() {
  const token = await getAccessToken();
  const users = await amoGetAll("/api/v4/users", token);
  const kulagin = users.filter(u => /кулагин|kulagin/i.test(`${u.name} ${u.last_name}`));
  console.log("amo users kulagin", kulagin);
  const rows = await listAll("deals", { filter: 'deal_type~"ref:"', fields: "id,deal_id,amo_id,owner" });
  let updated = 0;
  const ownerCounts = {};
  for (const row of rows) {
    const amoId = Number(row.amo_id);
    if (!amoId) continue;
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": amoId });
    const lead = leads[0];
    if (!lead) continue;
    const amoOwner = await resolveCrmPersonFromAmo(lead.responsible_user_id, token, { defaultIfMissing: true });
    const key = amoOwner || "(empty)";
    ownerCounts[key] = (ownerCounts[key] || 0) + 1;
    if (amoOwner && amoOwner !== row.owner) {
      await updateRecord("deals", row.id, { owner: amoOwner });
      updated += 1;
    }
  }
  console.log(JSON.stringify({ updated, ownerCounts }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
