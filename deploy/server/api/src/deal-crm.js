"use strict";

const {
  listAll, findOne, createRecord, updateRecord, deleteRecord, deleteByFilter,
  uploadRecord, getFileUrl,
} = require("./pb-client");

async function resolveDealPbId(dealId) {
  const row = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  return row?.id || null;
}

function mapActivity(row, dealId) {
  return {
    id: row.id,
    dealId,
    type: row.activity_type,
    body: row.body || "",
    author: row.author || "",
    authorEmail: row.author_email || "",
    meta: safeJson(row.meta_json),
    at: row.activity_at || row.created,
    refId: row.ref_id || "",
  };
}

function mapTask(row, dealId) {
  return {
    id: row.id,
    dealId,
    title: row.title || "",
    description: row.description || "",
    assignee: row.assignee || "",
    dueAt: row.due_at || "",
    doneAt: row.done_at || "",
    reminderAt: row.reminder_at || "",
    status: row.status || "open",
    activityId: row.activity_id || "",
    createdBy: row.created_by || "",
  };
}

function mapFile(row, dealId) {
  return {
    id: row.id,
    dealId,
    label: row.label || "",
    originalName: row.original_name || "",
    size: row.size || 0,
    mimeType: row.mime_type || "",
    uploadedBy: row.uploaded_by || "",
    uploadedAt: row.uploaded_at || "",
    url: row.file ? `/api/deals/${encodeURIComponent(dealId)}/files/${row.id}/download` : "",
    fileName: row.file || "",
  };
}

function mapContact(row, dealId) {
  return {
    id: row.id,
    dealId,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    role: row.role || "",
    sortOrder: row.sort_order || 0,
    isPrimary: Boolean(row.is_primary),
  };
}

function mapInfo(row, dealId) {
  if (!row) return null;
  return {
    id: row.id,
    dealId,
    companyName: row.company_name || "",
    companyInn: row.company_inn || "",
    companyKpp: row.company_kpp || "",
    companyOgrn: row.company_ogrn || "",
    companyAddress: row.company_address || "",
    website: row.website || "",
    utmSource: row.utm_source || "",
    utmMedium: row.utm_medium || "",
    utmCampaign: row.utm_campaign || "",
    utmContent: row.utm_content || "",
    utmTerm: row.utm_term || "",
    sourceChannel: row.source_channel || "",
    landingPage: row.landing_page || "",
    referrer: row.referrer || "",
    leadDate: row.lead_date || "",
    notes: row.notes || "",
  };
}

function safeJson(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

async function listActivities(dealId) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) return [];
  const rows = await listAll("deal_activities", {
    filter: `deal="${pbId}"`,
    sort: "-activity_at,-created",
  });
  return rows.map(r => mapActivity(r, dealId));
}

async function addActivity(dealId, { type, body, author, authorEmail, meta, refId }) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  const row = await createRecord("deal_activities", {
    deal: pbId,
    activity_type: type,
    body: body || "",
    author: author || "",
    author_email: authorEmail || "",
    meta_json: meta ? JSON.stringify(meta) : "",
    activity_at: new Date().toISOString(),
    ref_id: refId || "",
  });
  return mapActivity(row, dealId);
}

async function listTasks(dealId) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) return [];
  const rows = await listAll("deal_tasks", {
    filter: `deal="${pbId}"`,
    sort: "due_at,created",
  });
  return rows.map(r => mapTask(r, dealId));
}

async function listAllTasks({ assignee, from, to } = {}) {
  const filters = [];
  if (assignee) filters.push(`assignee="${assignee.replace(/"/g, '\\"')}"`);
  if (from) filters.push(`due_at>="${from}"`);
  if (to) filters.push(`due_at<="${to}"`);
  filters.push('status="open"');
  const filter = filters.length ? filters.join(" && ") : 'status="open"';
  const rows = await listAll("deal_tasks", { filter, sort: "due_at" });
  const dealRows = await listAll("deals", { fields: "id,deal_id,customer,owner" });
  const dealMap = Object.fromEntries(dealRows.map(d => [d.id, d]));
  return rows.map(r => {
    const d = dealMap[r.deal] || {};
    return { ...mapTask(r, d.deal_id || ""), customer: d.customer || "", owner: d.owner || "" };
  });
}

async function saveTask(dealId, task, { savedBy }) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  const body = {
    deal: pbId,
    title: task.title || "",
    description: task.description || "",
    assignee: task.assignee || "",
    due_at: task.dueAt || null,
    done_at: task.doneAt || null,
    reminder_at: task.reminderAt || null,
    status: task.status || "open",
    activity_id: task.activityId || "",
    created_by: task.createdBy || savedBy || "",
  };
  let row;
  if (task.id) {
    row = await updateRecord("deal_tasks", task.id, body);
  } else {
    row = await createRecord("deal_tasks", body);
    await addActivity(dealId, {
      type: "task_created",
      body: `Задача: ${task.title}`,
      author: savedBy,
      refId: row.id,
    });
  }
  if (task.status === "done" && task.id) {
    await addActivity(dealId, {
      type: "task_done",
      body: `Выполнено: ${task.title}`,
      author: savedBy,
      refId: row.id,
    });
  }
  return mapTask(row, dealId);
}

async function deleteTask(dealId, taskId) {
  await deleteRecord("deal_tasks", taskId);
  return { ok: true };
}

async function listFiles(dealId) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) return [];
  const rows = await listAll("deal_files", {
    filter: `deal="${pbId}"`,
    sort: "-uploaded_at,-created",
  });
  return rows.map(r => mapFile(r, dealId));
}

async function uploadDealFile(dealId, file, { label, uploadedBy }) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  const row = await uploadRecord("deal_files", {
    deal: pbId,
    label: label || "Файл",
    original_name: file.originalname || file.name || "file",
    size: file.size || 0,
    mime_type: file.mimetype || "",
    uploaded_by: uploadedBy || "",
    uploaded_at: new Date().toISOString(),
  }, { file: file.buffer, fileName: file.originalname || file.name });
  const mapped = mapFile(row, dealId);
  await addActivity(dealId, {
    type: "file_uploaded",
    body: `Файл: ${mapped.originalName} (${mapped.label})`,
    author: uploadedBy,
    refId: row.id,
  });
  return mapped;
}

async function deleteDealFile(dealId, fileId) {
  await deleteRecord("deal_files", fileId);
  return { ok: true };
}

async function listContacts(dealId) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) return [];
  const rows = await listAll("deal_contacts", {
    filter: `deal="${pbId}"`,
    sort: "sort_order,created",
  });
  return rows.map(r => mapContact(r, dealId));
}

async function saveContacts(dealId, contacts) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  await deleteByFilter("deal_contacts", `deal="${pbId}"`);
  const saved = [];
  for (let i = 0; i < (contacts || []).length; i++) {
    const c = contacts[i];
    const row = await createRecord("deal_contacts", {
      deal: pbId,
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      role: c.role || "",
      sort_order: i,
      is_primary: Boolean(c.isPrimary),
    });
    saved.push(mapContact(row, dealId));
  }
  return saved;
}

async function getDealInfo(dealId) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) return null;
  const row = await findOne("deal_info", `deal="${pbId}"`);
  return mapInfo(row, dealId);
}

async function saveDealInfo(dealId, info) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  const body = {
    deal: pbId,
    company_name: info.companyName || "",
    company_inn: info.companyInn || "",
    company_kpp: info.companyKpp || "",
    company_ogrn: info.companyOgrn || "",
    company_address: info.companyAddress || "",
    website: info.website || "",
    utm_source: info.utmSource || "",
    utm_medium: info.utmMedium || "",
    utm_campaign: info.utmCampaign || "",
    utm_content: info.utmContent || "",
    utm_term: info.utmTerm || "",
    source_channel: info.sourceChannel || "",
    landing_page: info.landingPage || "",
    referrer: info.referrer || "",
    lead_date: info.leadDate || null,
    notes: info.notes || "",
  };
  const existing = await findOne("deal_info", `deal="${pbId}"`);
  const row = existing
    ? await updateRecord("deal_info", existing.id, body)
    : await createRecord("deal_info", body);
  return mapInfo(row, dealId);
}

async function getDealCrmBundle(dealId) {
  const [activities, tasks, files, contacts, info] = await Promise.all([
    listActivities(dealId),
    listTasks(dealId),
    listFiles(dealId),
    listContacts(dealId),
    getDealInfo(dealId),
  ]);
  return { activities, tasks, files, contacts, info };
}

module.exports = {
  resolveDealPbId,
  listActivities,
  addActivity,
  listTasks,
  listAllTasks,
  saveTask,
  deleteTask,
  listFiles,
  uploadDealFile,
  deleteDealFile,
  listContacts,
  saveContacts,
  getDealInfo,
  saveDealInfo,
  getDealCrmBundle,
};
