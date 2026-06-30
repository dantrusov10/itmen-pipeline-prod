"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { findOne } = require("/opt/itmen-pipeline/api/src/pb-client");

async function main() {
  const amoId = Number(process.argv[2] || 40704526);
  const token = await getAccessToken();
  const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": amoId });
  const lead = leads[0];
  if (!lead) { console.log("not found in amo"); return; }
  const pipes = await amoGetAll("/api/v4/leads/pipelines", token);
  const pipe = pipes.find(p => Number(p.id) === Number(lead.pipeline_id));
  const stage = (pipe?._embedded?.statuses || []).find(s => Number(s.id) === Number(lead.status_id));
  const crm = await findOne("deals", `amo_id=${amoId}`);
  console.log(JSON.stringify({
    amoId,
    name: lead.name,
    pipeline: pipe?.name,
    stage: stage?.name,
    inCrm: Boolean(crm),
    crmDealId: crm?.deal_id || null,
    url: `https://inferit.amocrm.ru/leads/detail/${amoId}`,
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
