"use strict";

const { findOne, listAll, createRecord, updateRecord } = require("./pb-client");
const { amoGetAll } = require("./amo-client");
const { saveSingleDeal } = require("./mapper");
const { addActivity, saveTask, upsertDealActivity, cleanupLegacyAmoTaskActivities } = require("./deal-crm");
const { resolveCompany, resolveContact } = require("./entity-resolve");
const { resolveCrmPersonFromAmo, DEFAULT_OWNER } = require("./amo-users");
const { formatMskNaiveFromUnix, normalizeDueAtMsk } = require("./msk-datetime");
const {
  normTitle,
  pickCanonicalOpenTask,
  groupTasksByTitle,
  isAmoTaskRef,
  isSalesAmoTaskRow,
  isSalesPipelineDeal,
} = require("./amo-task-utils");

const FIELD_MAP = {
  бюджет: ["deals", "amount"],
  "ожидаемый бюджет": ["deals", "expected_budget"],
  presale: ["deals", "capabilities"],
  партнер: ["deals", "partner"],
  партнёр: ["deals", "partner"],
  конкуренты: ["deals", "competitors"],
  отрасль: ["deals", "industry"],
  "тип сделки": ["deals", "deal_type"],
  вероятность: ["deals", "manual_prob"],
  "шанс закрытия": ["deals", "manual_prob"],
  "срок задачи": ["deals", "task_due"],
  "период бюджета": ["deals", "budget_period"],
  "статус бюджета": ["deals", "budget_status"],
  "следующий шаг": ["deals", "next_step_comment"],
  "тип следующего шага": ["deals", "next_step_type"],
  риск: ["deals", "risk_comment"],
  "тип риска": ["deals", "risk_type"],
  commit: ["deals", "commit_status"],
  dml: ["deals", "dml"],
  "маржа партнера": ["deals", "partner_discount"],
  "процент скидки клиенту": ["deals", "client_discount"],
};

const INFO_MAP = {
  "продукт итмен": "product_itmen",
  "конечные точки": "endpoints",
  "формат закупки": "procurement_format",
  дистрибьютор: "distributor",
};

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/ё/g, "е");
}

function mapCustomField(fieldName) {
  const n = norm(fieldName);
  if (INFO_MAP[n]) return { coll: "deal_info", field: INFO_MAP[n] };
  if (FIELD_MAP[n]) {
    const [coll, field] = FIELD_MAP[n];
    return { coll, field };
  }
  for (const [key, target] of Object.entries(INFO_MAP)) {
    if (n.includes(key)) return { coll: "deal_info", field: target };
  }
  for (const [key, [coll, field]] of Object.entries(FIELD_MAP)) {
    if (n.includes(key)) return { coll, field };
  }
  return null;
}

function readCfValue(cf) {
  const vals = cf?.values || [];
  if (!vals.length) return null;
  const v = vals[0];
  return v?.value ?? v?.enum_id ?? v?.enum ?? null;
}

function leadTitle(lead) {
  return String(lead?.name || lead?.title || "").trim() || `Amo #${lead?.id}`;
}

async function findDealRowByAmoId(amoId) {
  const n = Number(amoId);
  if (!n) return null;
  return findOne("deals", `amo_id=${n}`);
}

async function findDealByAmoId(amoId) {
  return findDealRowByAmoId(amoId);
}

function buildPatchesFromLead(lead) {
  const dealsPatch = {};
  const infoPatch = {};
  for (const cf of lead?.custom_fields_values || []) {
    const mapped = mapCustomField(cf.field_name || cf.field_code || "");
    if (!mapped) continue;
    const val = readCfValue(cf);
    if (val == null || val === "") continue;
    if (mapped.coll === "deals") dealsPatch[mapped.field] = val;
    else infoPatch[mapped.field] = val;
  }
  if (lead.price != null && lead.price !== "") dealsPatch.amount = Number(lead.price) || 0;
  return { dealsPatch, infoPatch };
}

async function upsertDealInfo(pbDealId, patch) {
  if (!pbDealId || !Object.keys(patch).length) return;
  const existing = await findOne("deal_info", `deal="${pbDealId}"`);
  const body = { deal: pbDealId, ...patch };
  if (existing) await updateRecord("deal_info", existing.id, body);
  else await createRecord("deal_info", body);
}

async function ensureReferenceListItem(pipeline, title) {
  const val = String(title || "").trim();
  if (!val) return;
  for (const listKey of ["partners", "distributors"]) {
    const existing = await findOne("list_items", `list_key="${listKey}" && value="${val.replace(/"/g, '\\"')}"`);
    if (!existing) {
      const rows = await listAll("list_items", { filter: `list_key="${listKey}"`, sort: "-sort_order" });
      const sortOrder = (rows[0]?.sort_order || 0) + 1;
      await createRecord("list_items", { list_key: listKey, value: val, sort_order: sortOrder, active: true });
    }
  }
}

async function createOrUpdateDealFromLead({ lead, pipeline, crmStage, token }) {
  const amoId = Number(lead.id);
  const title = leadTitle(lead);
  const existing = await findDealRowByAmoId(amoId);
  const { dealsPatch, infoPatch } = buildPatchesFromLead(lead);
  const useDefaultOwner = pipeline?.type === "reference";
  const amoOwner = await resolveCrmPersonFromAmo(lead.responsible_user_id, token, {
    defaultIfMissing: useDefaultOwner,
  });

  if (dealsPatch.owner) {
    const patchOwner = await resolveCrmPersonFromAmo(dealsPatch.owner, token, {
      defaultIfMissing: useDefaultOwner,
    });
    if (patchOwner && !/^\d+$/.test(String(patchOwner))) dealsPatch.owner = patchOwner;
    else delete dealsPatch.owner;
  }

  const resolvedOwner = amoOwner
    || dealsPatch.owner
    || (existing?.owner && !/^\d+$/.test(String(existing.owner)) ? existing.owner : "")
    || (useDefaultOwner ? DEFAULT_OWNER : "");

  const baseDeal = {
    id: existing?.deal_id,
    amoId,
    customer: title,
    stage: crmStage || dealsPatch.stage || existing?.stage || "Взят в работу",
    owner: resolvedOwner,
    amount: dealsPatch.amount ?? existing?.amount ?? 0,
    pipelineId: pipeline.id,
    ...dealsPatch,
    customer: title,
    owner: resolvedOwner,
  };

  if (pipeline.type === "reference") {
    baseDeal.dealType = `ref:${pipeline.id}`;
    await ensureReferenceListItem(pipeline, title);
  }

  const { saved, isNew } = await saveSingleDeal(baseDeal, { savedBy: "amo-sync", isNew: !existing });
  const pbRow = await findDealRowByAmoId(amoId);
  if (pbRow && Object.keys(infoPatch).length) {
    await upsertDealInfo(pbRow.id, infoPatch);
  }
  if (pipeline.referenceField === "partner" && title && pbRow) {
    await updateRecord("deals", pbRow.id, { partner: title });
  }
  if (pipeline.referenceField === "distributor" && pbRow) {
    await upsertDealInfo(pbRow.id, { distributor: infoPatch.distributor || title });
  }
  return { dealId: saved?.id || pbRow?.deal_id, created: isNew, pbId: pbRow?.id };
}

async function loadExistingRefs(pbId) {
  const [acts, tasks] = await Promise.all([
    listAll("deal_activities", { filter: `deal="${pbId}"`, fields: "id,ref_id,body,activity_at" }),
    listAll("deal_tasks", {
      filter: `deal="${pbId}"`,
      fields: "id,title,status,due_at,activity_id,assignee,description",
    }),
  ]);
  const taskByAmoRef = new Map();
  const tasksByTitle = groupTasksByTitle(tasks);
  const taskTitles = new Set(tasksByTitle.keys());
  for (const t of tasks) {
    const ref = String(t.activity_id || "").trim();
    if (ref.startsWith("amo:task:")) taskByAmoRef.set(ref, t);
  }
  return {
    activityRefs: new Set(acts.map(a => a.ref_id).filter(Boolean)),
    activityByRef: new Map(acts.filter(a => a.ref_id).map(a => [a.ref_id, a])),
    taskTitles,
    tasksByTitle,
    taskByAmoRef,
  };
}

function noteActivityType(note) {
  const t = norm(note?.note_type || note?.type || "common");
  if (t.includes("task")) return "task_done";
  if (t.includes("call")) return "call";
  if (t.includes("sms")) return "sms";
  return "comment";
}

async function syncAmoTaskFeed({
  dealId, pbId, amoRef, title, description, assignee, isDone, createdAt, doneAt,
}) {
  const author = assignee || "amo-sync";
  const createdIso = createdAt || new Date().toISOString();
  await upsertDealActivity(dealId, pbId, {
    refId: `${amoRef}:created`,
    type: "task_created",
    body: `Задача: ${title}`,
    author,
    at: createdIso,
    meta: { amo_task: true },
  });
  if (description && !isDone) {
    await upsertDealActivity(dealId, pbId, {
      refId: `${amoRef}:comment`,
      type: "comment",
      body: description,
      author,
      at: doneAt || createdIso,
      meta: { amo_task: true, amo_task_comment: true },
    });
  }
  if (isDone) {
    const doneIso = doneAt || createdIso;
    const doneBody = description
      ? `Выполнено: ${title}\n${description}`
      : `Выполнено: ${title}`;
    await upsertDealActivity(dealId, pbId, {
      refId: `${amoRef}:done`,
      type: "task_done",
      body: doneBody,
      author,
      at: doneIso,
      meta: { amo_task: true },
    });
  }
}

function taskNeedsUpdate(existing, payload) {
  if (!existing) return true;
  const prevDue = normalizeDueAtMsk(existing.due_at) || "";
  const nextDue = normalizeDueAtMsk(payload.dueAt) || "";
  const prevStatus = existing.status || "open";
  const prevDesc = String(existing.description || "").trim();
  const nextDesc = String(payload.description || "").trim();
  const prevAssignee = norm(existing.assignee || "");
  const nextAssignee = norm(payload.assignee || "");
  return prevStatus !== payload.status
    || prevDue !== nextDue
    || norm(existing.title || "") !== norm(payload.title || "")
    || prevDesc !== nextDesc
    || prevAssignee !== nextAssignee
    || !String(existing.activity_id || "").startsWith("amo:task:");
}

async function closeDuplicateTask(dealId, task, reason = "дубль (amo-sync)") {
  await saveTask(dealId, {
    id: task.id,
    title: task.title || "",
    status: "done",
    dueAt: task.due_at,
    assignee: task.assignee,
    activityId: task.activity_id || "",
    result: reason,
    doneAt: new Date().toISOString(),
  }, { savedBy: "amo-sync" });
}

async function dedupeOpenTasksByTitle({ dealId, pbId }) {
  const tasks = await listAll("deal_tasks", { filter: `deal="${pbId}"` });
  const salesTasks = tasks.filter(isSalesAmoTaskRow);
  const byTitle = groupTasksByTitle(salesTasks);
  let closed = 0;
  for (const group of byTitle.values()) {
    const open = group.filter(t => (t.status || "open") !== "done");
    if (open.length <= 1) continue;
    const keeper = pickCanonicalOpenTask(open);
    if (!keeper) continue;
    for (const dup of open) {
      if (dup.id === keeper.id) continue;
      await closeDuplicateTask(dealId, dup);
      closed += 1;
    }
  }
  return closed;
}

async function syncLeadNotesAndTasks({ lead, token, dealId, pbId }) {
  const dealRow = await findOne("deals", `id="${String(pbId).replace(/"/g, '\\"')}"`);
  if (!isSalesPipelineDeal(dealRow)) return;

  const { activityRefs, activityByRef, taskTitles, taskByAmoRef, tasksByTitle } = await loadExistingRefs(pbId);
  const leadOwner = await resolveCrmPersonFromAmo(lead.responsible_user_id, token, { defaultIfMissing: false });
  const resolvePerson = async (id) => {
    const hit = await resolveCrmPersonFromAmo(id, token, { defaultIfMissing: false });
    if (hit && !/^\d+$/.test(String(hit))) return hit;
    return leadOwner || hit || "";
  };
  const notes = await amoGetAll("/api/v4/leads/notes", token, {
    "filter[entity_id]": lead.id,
    "filter[entity_type]": "leads",
  });
  for (const note of notes) {
    const ref = `amo:note:${note.id}`;
    const body = String(note.params?.text || note.text || "").trim() || String(note.note_type || "Заметка");
    const at = note.created_at ? new Date(note.created_at * 1000).toISOString() : new Date().toISOString();
    if (activityRefs.has(ref)) {
      const prev = activityByRef.get(ref);
      if (prev && String(prev.body || "").trim() !== body) {
        await updateRecord("deal_activities", prev.id, { body, activity_at: at });
      }
      continue;
    }
    const author = await resolvePerson(note.responsible_user_id || note.created_by)
      || "amo-sync";
    await createRecord("deal_activities", {
      deal: pbId,
      activity_type: noteActivityType(note),
      body,
      author,
      meta_json: JSON.stringify({ amo_note_id: note.id, amo_lead_id: lead.id }),
      activity_at: at,
      ref_id: ref,
    });
  }

  const tasks = await amoGetAll("/api/v4/tasks", token, {
    "filter[entity_id]": lead.id,
    "filter[entity_type]": "leads",
  });
  let nearestOpenDue = null;
  for (const task of tasks) {
    const title = String(task.text || "").trim();
    if (!title) continue;
    const amoRef = `amo:task:${task.id}`;
    const isDone = Boolean(task.is_completed);
    const createdAt = task.created_at ? new Date(task.created_at * 1000).toISOString() : "";
    const dueAt = task.complete_till ? formatMskNaiveFromUnix(task.complete_till) : "";
    const doneAt = isDone && task.updated_at ? new Date(task.updated_at * 1000).toISOString() : "";
    const status = isDone ? "done" : "open";
    const assignee = await resolvePerson(task.responsible_user_id);
    const description = String(task.result?.text || "");
    const taskPayload = {
      title,
      description,
      dueAt,
      status,
      assignee,
      activityId: amoRef,
      createdAt: createdAt || undefined,
      doneAt: doneAt || undefined,
      result: isDone ? description : undefined,
    };

    let existing = taskByAmoRef.get(amoRef) || null;
    if (!existing) {
      const sameTitle = (tasksByTitle.get(normTitle(title)) || []).filter(isSalesAmoTaskRow);
      existing = pickCanonicalOpenTask(sameTitle, amoRef)
        || sameTitle.find(t => isAmoTaskRef(t.activity_id))
        || sameTitle[0]
        || null;
    }

    if (existing && !isSalesAmoTaskRow(existing) && !isAmoTaskRef(existing.activity_id)) {
      existing = null;
    }

    if (existing) {
      taskPayload.id = existing.id;
      if (taskNeedsUpdate(existing, taskPayload)) {
        await saveTask(dealId, taskPayload, { savedBy: assignee || "amo-sync", fromAmo: true });
      }
    } else if (!taskTitles.has(normTitle(title))) {
      await saveTask(dealId, taskPayload, { savedBy: assignee || "amo-sync", fromAmo: true });
      taskTitles.add(normTitle(title));
      const list = tasksByTitle.get(normTitle(title)) || [];
      list.push({ id: "new", title, activity_id: amoRef, status, due_at: dueAt });
      tasksByTitle.set(normTitle(title), list);
    }

    taskByAmoRef.set(amoRef, { ...(existing || {}), ...taskPayload, activity_id: amoRef });
    await syncAmoTaskFeed({
      dealId,
      pbId,
      amoRef,
      title,
      description,
      assignee,
      isDone,
      createdAt,
      doneAt,
    });
    if (!isDone && dueAt) {
      const dueDay = dueAt.slice(0, 10);
      if (!nearestOpenDue || dueDay < nearestOpenDue) nearestOpenDue = dueDay;
    }
  }

  const seenAmoRefs = new Set(tasks.map(t => `amo:task:${t.id}`));
  for (const [ref, existingTask] of taskByAmoRef) {
    if (seenAmoRefs.has(ref)) continue;
    if (!isSalesAmoTaskRow(existingTask)) continue;
    if ((existingTask.status || "open") === "done") continue;
    await saveTask(dealId, {
      id: existingTask.id,
      title: existingTask.title || "",
      status: "done",
      dueAt: existingTask.due_at,
      assignee: existingTask.assignee,
      activityId: ref,
      doneAt: new Date().toISOString(),
    }, { savedBy: "amo-sync", fromAmo: true });
  }

  await dedupeOpenTasksByTitle({ dealId, pbId });

  if (nearestOpenDue) {
    const row = await findDealRowByAmoId(lead.id);
    if (row && String(row.task_due || "").slice(0, 10) !== nearestOpenDue) {
      await updateRecord("deals", row.id, { task_due: nearestOpenDue });
    }
  }
}

async function syncLeadFromAmo({ lead, token, pipeline, stageName, crmStage }) {
  const { dealId, created, pbId } = await createOrUpdateDealFromLead({ lead, pipeline, crmStage, token });
  if (!dealId || !pbId) return { synced: false, created: false };

  const existingRow = await findDealRowByAmoId(lead.id);
  const { dealsPatch, infoPatch } = buildPatchesFromLead(lead);
  if (existingRow) {
    const ownerPatch = { ...dealsPatch };
    if (!ownerPatch.owner) {
      const amoOwner = await resolveCrmPersonFromAmo(lead.responsible_user_id, token, {
        defaultIfMissing: pipeline?.type === "reference",
      });
      if (amoOwner) ownerPatch.owner = amoOwner;
    }
    if (Object.keys(ownerPatch).length) {
      await updateRecord("deals", existingRow.id, ownerPatch);
    }
    if (Object.keys(infoPatch).length) {
      await upsertDealInfo(existingRow.id, infoPatch);
    }
    if (crmStage && existingRow.stage !== crmStage) {
      await updateRecord("deals", existingRow.id, { stage: crmStage });
      await addActivity(dealId, {
        type: "stage_change",
        body: `${existingRow.stage || "—"} → ${crmStage}`,
        author: "amo-sync",
        meta: { amo: true, from: existingRow.stage, to: crmStage },
      });
    }
  }

  await syncLeadNotesAndTasks({ lead, token, dealId, pbId });

  const companyName = lead._embedded?.companies?.[0]?.name || lead.company?.name;
  if (companyName) {
    await resolveCompany({ name: companyName });
    await upsertDealInfo(pbId, { company_name: companyName });
  }
  for (const c of lead._embedded?.contacts || []) {
    await resolveContact({
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name,
      email: "",
      phone: "",
    });
  }

  return { synced: true, created, dealId };
}

async function fixAmoFeedChronology({ batchSize = 40, offset = 0 } = {}) {
  const { getAccessToken } = require("./amo-client");
  const token = await getAccessToken();
  const deals = await listAll("deals", {
    filter: "amo_id>0 && archived=false",
    fields: "id,deal_id,amo_id",
    sort: "deal_id",
  });
  const rows = deals.filter(d => Number(d.amo_id) > 0);
  let nextOffset = offset;
  const stats = { processed: 0, cleaned: 0, synced: 0, errors: 0 };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function syncOneDeal(row) {
    await cleanupLegacyAmoTaskActivities(row.id);
    stats.cleaned += 1;
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": row.amo_id, with: "contacts" });
    const lead = leads[0];
    if (!lead) return;
    await syncLeadNotesAndTasks({
      lead,
      token,
      dealId: row.deal_id,
      pbId: row.id,
    });
    stats.synced += 1;
    stats.processed += 1;
  }

  for (let i = 0; i < batchSize; i++) {
    const row = rows[nextOffset % rows.length];
    nextOffset += 1;
    if (!row) break;
    try {
      await syncOneDeal(row);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes("429")) {
        await sleep(6000);
        try {
          await syncOneDeal(row);
          continue;
        } catch (retryErr) {
          stats.errors += 1;
          console.warn("fixAmoFeedChronology", row.deal_id, retryErr.message);
          continue;
        }
      }
      stats.errors += 1;
      console.warn("fixAmoFeedChronology", row.deal_id, msg);
    }
    await sleep(350);
  }
  return {
    ok: true,
    total: rows.length,
    nextOffset: rows.length ? nextOffset % rows.length : 0,
    ...stats,
  };
}

module.exports = {
  findDealByAmoId,
  findDealRowByAmoId,
  syncLeadFromAmo,
  syncLeadNotesAndTasks,
  syncAmoTaskFeed,
  dedupeOpenTasksByTitle,
  fixAmoFeedChronology,
  buildPatchesFromLead,
  leadTitle,
};
