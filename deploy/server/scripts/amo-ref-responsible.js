"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { getPipelinesConfig } = require("/opt/itmen-pipeline/api/src/pipelines-config");

async function main() {
  const token = await getAccessToken();
  const cfg = await getPipelinesConfig();
  const users = await amoGetAll("/api/v4/users", token);
  const userName = new Map(users.map(u => [String(u.id), [u.name, u.last_name].filter(Boolean).join(" ").trim()]));
  const refPipes = (cfg.pipelines || []).filter(p => p.type === "reference" && p.amoPipelineId);
  const counts = {};
  for (const pipe of refPipes) {
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[pipeline_id]": pipe.amoPipelineId });
    for (const lead of leads) {
      const id = String(lead.responsible_user_id || "");
      const name = userName.get(id) || id;
      const key = `${pipe.id}: ${name} (${id})`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(JSON.stringify(sorted.slice(0, 20), null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
