#!/usr/bin/env node
"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { findOne, listAll, updateRecord } = require("/opt/itmen-pipeline/api/src/pb-client");
const { resolveCrmPersonFromAmo } = require("/opt/itmen-pipeline/api/src/amo-users");

const EXCLUDED = [/неразобран/i, /непроработан/i, /отказ/i, /успеш/i, /реализован/i, /провал/i];

async function checkLead(amoId) {
  const token = await getAccessToken();
  const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": amoId });
  const lead = leads[0];
  if (!lead) return { amoId, found: false };
  const pipes = await amoGetAll("/api/v4/leads/pipelines", token);
  const pipe = pipes.find(p => Number(p.id) === Number(lead.pipeline_id));
  const stage = (pipe?._embedded?.statuses || []).find(s => Number(s.id) === Number(lead.status_id));
  const crm = await findOne("deals", `amo_id=${amoId}`);
  return {
    amoId,
    name: lead.name,
    pipeline: pipe?.name,
    stage: stage?.name,
    inCrm: Boolean(crm),
    crmDealId: crm?.deal_id || null,
    url: `https://inferit.amocrm.ru/leads/detail/${amoId}`,
  };
}

async function backfillTasks() {
  const token = await getAccessToken();
  const rows = await listAll("deal_tasks", { filter: 'activity_id~"amo:task:"' });
  let updated = 0;
  for (const row of rows) {
    const m = String(row.activity_id || "").match(/amo:task:(\d+)/);
    if (!m) continue;
    const tasks = await amoGetAll("/api/v4/tasks", token, { "filter[id]": m[1] });
    const task = tasks[0];
    if (!task) continue;
    const dueAt = task.complete_till ? new Date(task.complete_till * 1000).toISOString() : "";
    const assignee = await resolveCrmPersonFromAmo(task.responsible_user_id, token);
    const status = task.is_completed ? "done" : "open";
    const patch = {};
    if (dueAt && !row.due_at) patch.due_at = dueAt;
    if (assignee && /^\d+$/.test(String(row.assignee || ""))) patch.assignee = assignee;
    if (status !== (row.status || "open")) patch.status = status;
    if (Object.keys(patch).length) {
      await updateRecord("deal_tasks", row.id, patch);
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  const cmd = process.argv[2] || "compare";
  if (cmd === "lead") {
    console.log(JSON.stringify(await checkLead(Number(process.argv[3])), null, 2));
    return;
  }
  if (cmd === "backfill") {
    console.log("tasks updated:", await backfillTasks());
    return;
  }
  const token = await getAccessToken();
  const pipes = await amoGetAll("/api/v4/leads/pipelines", token);
  const pipe = pipes.find(p => /итмен/i.test(p.name || ""));
  const stageMap = new Map((pipe?._embedded?.statuses || []).map(s => [Number(s.id), s.name || ""]));
  const leads = await amoGetAll("/api/v4/leads", token, { "filter[pipeline_id]": pipe.id });
  const crmAmo = new Set((await listAll("deals", { filter: "amo_id>0", fields: "amo_id" })).map(r => Number(r.amo_id)));
  const missing = [];
  for (const lead of leads) {
    const stage = stageMap.get(Number(lead.status_id)) || "";
    if (EXCLUDED.some(re => re.test(stage))) continue;
    if (!crmAmo.has(Number(lead.id))) {
      missing.push({
        amoId: Number(lead.id),
        name: lead.name || "",
        stage,
        url: `https://inferit.amocrm.ru/leads/detail/${lead.id}`,
      });
    }
  }
  missing.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  console.log(JSON.stringify({ pipeline: pipe?.name, missingCount: missing.length, missing }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
