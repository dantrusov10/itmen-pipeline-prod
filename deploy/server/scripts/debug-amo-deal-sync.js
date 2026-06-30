#!/usr/bin/env node
"use strict";
const { listAll, createRecord, updateRecord, findOne } = require("/opt/itmen-pipeline/api/src/pb-client");
const { saveTask, upsertDealActivity } = require("/opt/itmen-pipeline/api/src/deal-crm");
const { amoGetAll, getAccessToken } = require("/opt/itmen-pipeline/api/src/amo-client");

const dealId = process.argv[2] || "D-008";

async function tryStep(label, fn) {
  try {
    await fn();
    console.log("OK", label);
  } catch (e) {
    console.error("FAIL", label, e.message);
    if (e.data) console.error("  data", JSON.stringify(e.data).slice(0, 500));
  }
}

(async () => {
  const deals = await listAll("deals", { filter: `deal_id="${dealId}"`, fields: "id,deal_id,amo_id" });
  const row = deals[0];
  const token = await getAccessToken();
  const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": row.amo_id, with: "contacts" });
  const lead = leads[0];
  const notes = await amoGetAll("/api/v4/leads/notes", token, {
    "filter[entity_id]": lead.id,
    "filter[entity_type]": "leads",
  });
  const tasks = await amoGetAll("/api/v4/tasks", token, {
    "filter[entity_id]": lead.id,
    "filter[entity_type]": "leads",
  });
  console.log("notes", notes.length, "tasks", tasks.length);

  for (const note of notes.slice(0, 5)) {
    const ref = `amo:note:${note.id}`;
    const body = String(note.params?.text || note.text || "").trim() || String(note.note_type || "Заметка");
    const at = note.created_at ? new Date(note.created_at * 1000).toISOString() : new Date().toISOString();
    await tryStep(`note ${note.id}`, async () => {
      const existing = await findOne("deal_activities", `ref_id="${ref.replace(/"/g, '\\"')}"`);
      if (existing) {
        await updateRecord("deal_activities", existing.id, { body, activity_at: at });
      } else {
        await createRecord("deal_activities", {
          deal: row.id,
          activity_type: "comment",
          body,
          author: "amo-sync",
          meta_json: JSON.stringify({ amo_note_id: note.id }),
          activity_at: at,
          ref_id: ref,
        });
      }
    });
  }

  for (const task of tasks.slice(0, 5)) {
    const amoRef = `amo:task:${task.id}`;
    const title = String(task.text || "").trim();
    const createdAt = task.created_at ? new Date(task.created_at * 1000).toISOString() : "";
    const doneAt = task.is_completed && task.updated_at ? new Date(task.updated_at * 1000).toISOString() : "";
    await tryStep(`task save ${task.id} ${title.slice(0, 40)}`, async () => {
      await saveTask(dealId, {
        title,
        status: task.is_completed ? "done" : "open",
        activityId: amoRef,
        createdAt: createdAt || undefined,
        doneAt: doneAt || undefined,
      }, { savedBy: "amo-sync", fromAmo: true });
    });
    await tryStep(`task feed ${task.id}`, async () => {
      await upsertDealActivity(dealId, row.id, {
        refId: `${amoRef}:created`,
        type: "task_created",
        body: `Задача: ${title}`,
        author: "amo-sync",
        at: createdAt || new Date().toISOString(),
        meta: { amo_task: true },
      });
      if (task.is_completed) {
        await upsertDealActivity(dealId, row.id, {
          refId: `${amoRef}:done`,
          type: "task_done",
          body: `Выполнено: ${title}`,
          author: "amo-sync",
          at: doneAt || createdAt,
          meta: { amo_task: true },
        });
      }
    });
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
