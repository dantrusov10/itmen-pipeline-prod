"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");

async function main() {
  const token = await getAccessToken();
  const leads = await amoGetAll("/api/v4/leads", token, {
    "filter[pipeline_id]": 0,
    limit: 1,
  });
  const pipes = await amoGetAll("/api/v4/leads/pipelines", token);
  const partner = pipes.find(p => /партн/i.test(p.name || ""));
  if (!partner) {
    console.log("no partner pipe");
    return;
  }
  const sample = await amoGetAll("/api/v4/leads", token, {
    "filter[pipeline_id]": partner.id,
    with: "responsible",
  });
  const ids = {};
  for (const lead of sample.slice(0, 50)) {
    const uid = lead.responsible_user_id;
    const emb = lead._embedded?.responsible?.[0] || lead._embedded?.users?.find(u => String(u.id) === String(uid));
    const name = emb ? [emb.name, emb.last_name].filter(Boolean).join(" ") : String(uid);
    ids[uid] = name;
  }
  console.log("pipeline", partner.name, partner.id);
  console.log(JSON.stringify(ids, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
