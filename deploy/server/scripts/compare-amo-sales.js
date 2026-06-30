"use strict";

const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { listAll } = require("/opt/itmen-pipeline/api/src/pb-client");
const { getPipelinesConfig } = require("/opt/itmen-pipeline/api/src/pipelines-config");

const EXCLUDED_STAGE_PATTERNS = [
  /неразобран/i,
  /непроработан/i,
  /отказ/i,
  /успеш/i,
  /реализован/i,
  /провал/i,
  /закрыт/i,
  /проигр/i,
  /lost/i,
  /won/i,
];

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/ё/g, "е");
}

function isExcludedStage(name) {
  const n = norm(name);
  return EXCLUDED_STAGE_PATTERNS.some(re => re.test(n));
}

async function loadAmoPipelines(token) {
  return amoGetAll("/api/v4/leads/pipelines", token);
}

async function main() {
  const token = await getAccessToken();
  const cfg = await getPipelinesConfig();
  const salesPipe = (cfg.pipelines || []).find(p => p.id === "sales") || {};
  const pipelines = await loadAmoPipelines(token);
  let pipe = null;
  if (salesPipe.amoPipelineId) {
    pipe = pipelines.find(p => Number(p.id) === Number(salesPipe.amoPipelineId));
  }
  if (!pipe) {
    const nameNeedle = norm(salesPipe.amoPipelineName || "итмен");
    pipe = pipelines.find(p => norm(p.name).includes(nameNeedle));
  }
  if (!pipe) {
    console.error("Pipeline not found. Available:", pipelines.map(p => `${p.id}: ${p.name}`).join("; "));
    process.exit(1);
  }

  const stageMap = new Map();
  for (const st of pipe._embedded?.statuses || []) {
    stageMap.set(Number(st.id), st.name || "");
  }

  const leads = await amoGetAll("/api/v4/leads", token, {
    "filter[pipeline_id]": pipe.id,
    with: "contacts",
  });

  const crmRows = await listAll("deals", {
    filter: 'archived=false',
    fields: "id,deal_id,amo_id,customer,stage,archived",
  });
  const amoIdsInCrm = new Set(
    crmRows.map(r => Number(r.amo_id)).filter(n => n > 0),
  );

  const inAmoNotCrm = [];
  const inWorkAmo = [];
  for (const lead of leads) {
    const stageName = stageMap.get(Number(lead.status_id)) || "";
    if (isExcludedStage(stageName)) continue;
    inWorkAmo.push(lead);
    const amoId = Number(lead.id);
    if (!amoIdsInCrm.has(amoId)) {
      inAmoNotCrm.push({
        amoId,
        name: lead.name || lead.title || "",
        stage: stageName,
        url: `https://inferit.amocrm.ru/leads/detail/${amoId}`,
        updatedAt: lead.updated_at ? new Date(lead.updated_at * 1000).toISOString() : "",
      });
    }
  }

  inAmoNotCrm.sort((a, b) => a.name.localeCompare(b.name, "ru"));

  console.log(JSON.stringify({
    pipeline: { id: pipe.id, name: pipe.name },
    amoInWork: inWorkAmo.length,
    crmWithAmo: amoIdsInCrm.size,
    missingInCrm: inAmoNotCrm.length,
    missing: inAmoNotCrm,
  }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
