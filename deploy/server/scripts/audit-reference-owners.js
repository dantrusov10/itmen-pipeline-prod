"use strict";
const { listAll, updateRecord } = require("/opt/itmen-pipeline/api/src/pb-client");
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { resolveCrmPersonFromAmo } = require("/opt/itmen-pipeline/api/src/amo-users");
const { getPipelinesConfig } = require("/opt/itmen-pipeline/api/src/pipelines-config");
const { syncLeadFromAmo } = require("/opt/itmen-pipeline/api/src/amo-lead-sync");

async function audit() {
  const rows = await listAll("deals", { filter: 'deal_type~"ref:"', fields: "id,deal_id,amo_id,customer,owner,deal_type" });
  const byOwner = {};
  for (const r of rows) {
    const o = r.owner || "(empty)";
    byOwner[o] = (byOwner[o] || 0) + 1;
  }
  const token = await getAccessToken();
  const users = await amoGetAll("/api/v4/users", token);
  const userById = new Map(users.map(u => [String(u.id), [u.name, u.last_name].filter(Boolean).join(" ").trim()]));
  const mismatches = [];
  const batch = 40;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const ids = chunk.map(r => r.amo_id).filter(Boolean).join(",");
    if (!ids) continue;
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": ids });
    const byId = new Map(leads.map(l => [Number(l.id), l]));
    for (const row of chunk) {
      const lead = byId.get(Number(row.amo_id));
      if (!lead) continue;
      const amoOwner = await resolveCrmPersonFromAmo(lead.responsible_user_id, token, { defaultIfMissing: true });
      const amoRaw = userById.get(String(lead.responsible_user_id)) || String(lead.responsible_user_id);
      if ((row.owner || "") !== (amoOwner || "")) {
        mismatches.push({
          dealId: row.deal_id,
          amoId: row.amo_id,
          crmOwner: row.owner,
          amoOwner,
          amoRaw,
          amoUserId: lead.responsible_user_id,
        });
      }
    }
  }
  return { total: rows.length, byOwner, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 30) };
}

async function fixOwners(dry = true) {
  const token = await getAccessToken();
  const cfg = await getPipelinesConfig();
  const refPipes = (cfg.pipelines || []).filter(p => p.type === "reference");
  const pipeByAmo = new Map(refPipes.filter(p => p.amoPipelineId).map(p => [String(p.amoPipelineId), p]));
  const rows = await listAll("deals", { filter: 'deal_type~"ref:"', fields: "id,deal_id,amo_id,owner,deal_type" });
  let updated = 0;
  const changes = [];
  const batch = 40;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const ids = chunk.map(r => r.amo_id).filter(Boolean).join(",");
    if (!ids) continue;
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": ids });
    const byId = new Map(leads.map(l => [Number(l.id), l]));
    for (const row of chunk) {
      const lead = byId.get(Number(row.amo_id));
      if (!lead) continue;
      const pipe = pipeByAmo.get(String(lead.pipeline_id));
      const amoOwner = await resolveCrmPersonFromAmo(lead.responsible_user_id, token, {
        defaultIfMissing: true,
      });
      const next = amoOwner || row.owner;
      if (next && next !== row.owner) {
        changes.push({ dealId: row.deal_id, from: row.owner, to: next, amoUserId: lead.responsible_user_id });
        if (!dry) {
          await updateRecord("deals", row.id, { owner: next });
          updated += 1;
        }
      }
    }
  }
  return { dry, updated, changes: changes.slice(0, 50), changeCount: changes.length };
}

async function resyncAll() {
  const token = await getAccessToken();
  const cfg = await getPipelinesConfig();
  const refPipes = (cfg.pipelines || []).filter(p => p.type === "reference" && p.amoPipelineId);
  const pipelines = await amoGetAll("/api/v4/leads/pipelines", token);
  const stageMap = {};
  for (const p of pipelines) {
    for (const s of p._embedded?.statuses || []) {
      stageMap[`${p.id}:${s.id}`] = { name: s.name || "", crmStage: s.name || "" };
    }
  }
  let synced = 0;
  for (const pipe of refPipes) {
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[pipeline_id]": pipe.amoPipelineId });
    for (const lead of leads) {
      const st = stageMap[`${lead.pipeline_id}:${lead.status_id}`] || { name: "", crmStage: "" };
      await syncLeadFromAmo({ lead, token, pipeline: pipe, stageName: st.name, crmStage: st.crmStage || st.name });
      synced += 1;
    }
  }
  return { synced };
}

async function main() {
  const cmd = process.argv[2] || "audit";
  if (cmd === "audit") {
    console.log(JSON.stringify(await audit(), null, 2));
    return;
  }
  if (cmd === "fix") {
    console.log(JSON.stringify(await fixOwners(process.argv[3] !== "apply"), null, 2));
    return;
  }
  if (cmd === "resync") {
    console.log(JSON.stringify(await resyncAll(), null, 2));
    return;
  }
  console.log("Usage: audit-reference-owners.js audit|fix [apply]|resync");
}

main().catch(e => { console.error(e); process.exit(1); });
