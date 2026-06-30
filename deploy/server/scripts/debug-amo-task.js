#!/usr/bin/env node
"use strict";
const { amoGetAll, getAccessToken } = require("/opt/itmen-pipeline/api/src/amo-client");
const { saveTask } = require("/opt/itmen-pipeline/api/src/deal-crm");
const { findOne } = require("/opt/itmen-pipeline/api/src/pb-client");

const TASK_ID = Number(process.argv[2] || 55646037);
const dealId = process.argv[3] || "D-008";

(async () => {
  const token = await getAccessToken();
  const tasks = await amoGetAll("/api/v4/tasks", token, { "filter[id]": TASK_ID });
  const task = tasks[0];
  console.log(JSON.stringify(task, null, 2));
  const amoRef = `amo:task:${TASK_ID}`;
  const existing = await findOne("deal_tasks", `activity_id="${amoRef.replace(/"/g, '\\"')}"`);
  console.log("existing", existing?.id, existing?.title?.slice(0, 80));
  const payload = {
    title: String(task.text || "").trim(),
    description: String(task.result?.text || ""),
    status: task.is_completed ? "done" : "open",
    activityId: amoRef,
    createdAt: task.created_at ? new Date(task.created_at * 1000).toISOString() : undefined,
    doneAt: task.is_completed && task.updated_at ? new Date(task.updated_at * 1000).toISOString() : undefined,
  };
  if (existing) payload.id = existing.id;
  console.log("payload lens title/desc", payload.title.length, payload.description.length);
  try {
    const r = await saveTask(dealId, payload, { savedBy: "amo-sync", fromAmo: true });
    console.log("save ok", r.id);
  } catch (e) {
    console.error("save fail", e.message);
    if (e.data) console.error(JSON.stringify(e.data));
  }
})().catch(e => { console.error(e); process.exit(1); });
