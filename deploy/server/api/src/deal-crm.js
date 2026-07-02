"use strict";

const {
  listAll, findOne, createRecord, updateRecord, deleteRecord, deleteByFilter,
  uploadRecord, getFileUrl,
} = require("./pb-client");

async function resolveDealPbId(dealId) {
  const row = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  return row?.id || null;
}

const TASK_TITLE_MAX = 300;

function clampTaskTitle(title, maxLen = TASK_TITLE_MAX) {
  const full = String(title || "").trim();
  if (full.length <= maxLen) return { title: full, overflow: "" };
  const cut = `${full.slice(0, maxLen - 1).trimEnd()}…`;
  return { title: cut, overflow: full };
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

const { normalizeDueAtMsk } = require("./msk-datetime");

function mapTask(row, dealId) {
  const status = row.status || "open";
  return {
    id: row.id,
    dealId,
    title: row.title || "",
    description: row.description || "",
    result: status === "done" ? (row.description || "") : "",
    assignee: row.assignee || "",
    dueAt: normalizeDueAtMsk(row.due_at) || row.due_at || "",
    doneAt: row.done_at || "",
    reminderAt: row.reminder_at || "",
    status,
    activityId: row.activity_id || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || row.created || "",
  };
}

function fmtDueRu(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 16).replace("T", " ");
}

const KNOWN_FILE_EXTS = new Set([
  ".pdf", ".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt", ".txt", ".csv",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".rar", ".7z", ".rtf",
]);

const MIME_TO_EXT = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.ms-powerpoint": ".ppt",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/zip": ".zip",
};

function hasValidFileExtension(name) {
  const m = String(name || "").match(/(\.[A-Za-z0-9]{2,5})$/);
  if (!m) return false;
  const ext = m[1].toLowerCase();
  if (KNOWN_FILE_EXTS.has(ext)) return true;
  if (/^\.\d{2,4}$/.test(ext)) return false;
  return /^\.[a-z]+$/.test(ext);
}

function ensureFileExtension(name, mimeType) {
  let n = String(name || "file").trim() || "file";
  if (hasValidFileExtension(n)) return n;
  let ext = MIME_TO_EXT[mimeType || ""] || "";
  if (ext === ".jpe") ext = ".jpg";
  if (ext && !n.toLowerCase().endsWith(ext)) return n + ext;
  return n;
}

function mapFile(row, dealId) {
  const originalName = ensureFileExtension(row.original_name || "", row.mime_type || "");
  return {
    id: row.id,
    dealId,
    label: row.label || "",
    originalName,
    size: row.size || 0,
    mimeType: row.mime_type || "",
    uploadedBy: row.uploaded_by || "",
    uploadedAt: row.uploaded_at || row.created || "",
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
    productItmen: row.product_itmen || "",
    endpoints: row.endpoints || "",
    procurementFormat: row.procurement_format || "",
    registrationDeadline: row.registration_deadline || "",
    infrastructureSize: row.infrastructure_size || "",
    grade: row.grade || "",
    closingTool: row.closing_tool || "",
    functionalFit: row.functional_fit || "",
    testStart: row.test_start || "",
    testEnd: row.test_end || "",
    distributor: row.distributor || "",
    activityKind: row.activity_kind || "",
    testOs: row.test_os || "",
    plannedPaymentDate: row.planned_payment_date || "",
    shipmentDate: row.shipment_date || "",
    projectMapUrl: row.project_map_url || "",
    abmTier: row.abm_tier || "",
    contractTerm: row.contract_term || "",
  };
}

function safeJson(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

function decodeUploadFilename(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  if (/[\u0400-\u04FF]/.test(s)) return s;
  try {
    const decoded = Buffer.from(s, "latin1").toString("utf8");
    if (/[\u0400-\u04FF]/.test(decoded)) return decoded.trim();
  } catch (_) { /* */ }
  return s;
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

async function addActivity(dealId, { type, body, author, authorEmail, meta, refId, at }) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  const row = await createRecord("deal_activities", {
    deal: pbId,
    activity_type: type,
    body: body || "",
    author: author || "",
    author_email: authorEmail || "",
    meta_json: meta ? JSON.stringify(meta) : "",
    activity_at: at || new Date().toISOString(),
    ref_id: refId || "",
  });
  return mapActivity(row, dealId);
}

async function upsertDealActivity(dealId, pbId, { refId, type, body, author, at, meta }) {
  const ref = String(refId || "").trim();
  if (!ref) throw new Error("refId required");
  const payload = {
    deal: pbId,
    activity_type: type,
    body: body || "",
    author: author || "",
    meta_json: meta ? JSON.stringify(meta) : "",
    activity_at: at || new Date().toISOString(),
    ref_id: ref,
  };
  const existing = await findOne("deal_activities", `ref_id="${ref.replace(/"/g, '\\"')}"`);
  if (existing) {
    const row = await updateRecord("deal_activities", existing.id, payload);
    return mapActivity(row, dealId);
  }
  const row = await createRecord("deal_activities", payload);
  return mapActivity(row, dealId);
}

async function cleanupLegacyAmoTaskActivities(pbId) {
  const acts = await listAll("deal_activities", { filter: `deal="${pbId}"` });
  for (const a of acts) {
    if (!["task_created", "task_done"].includes(a.activity_type || "")) continue;
    const ref = String(a.ref_id || "");
    if (ref.startsWith("amo:")) continue;
    await deleteRecord("deal_activities", a.id);
  }
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

async function listAllTasks({ assignee, from, to, includeDone } = {}) {
  const filters = [];
  if (assignee) filters.push(`assignee="${assignee.replace(/"/g, '\\"')}"`);
  if (from) filters.push(`due_at>="${from}"`);
  if (to) filters.push(`due_at<="${to}T23:59:59"`);
  if (includeDone) filters.push('(status="open" || status="done")');
  else filters.push('status="open"');
  const filter = filters.join(" && ");
  const rows = await listAll("deal_tasks", { filter, sort: "due_at" });
  const dealRows = await listAll("deals", { fields: "id,deal_id,customer,owner" });
  const dealMap = Object.fromEntries(dealRows.map(d => [d.id, d]));
  return rows.map(r => {
    const d = dealMap[r.deal] || {};
    return { ...mapTask(r, d.deal_id || ""), customer: d.customer || "", owner: d.owner || "" };
  });
}

async function saveTask(dealId, task, { savedBy, fromAmo } = {}) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  let prev = null;
  if (task.id) {
    prev = await findOne("deal_tasks", `id="${String(task.id).replace(/"/g, '\\"')}"`);
  }
  const status = task.status || "open";
  const { title: taskTitle, overflow: titleOverflow } = clampTaskTitle(task.title || prev?.title || "");
  let taskDescription = status === "done" && task.result
    ? task.result
    : (task.description || prev?.description || "");
  if (titleOverflow && !taskDescription.includes(titleOverflow.slice(0, 80))) {
    taskDescription = titleOverflow + (taskDescription ? `\n\n${taskDescription}` : "");
  }
  const body = {
    deal: pbId,
    title: taskTitle,
    description: taskDescription,
    assignee: task.assignee || "",
    due_at: normalizeDueAtMsk(task.dueAt) || null,
    done_at: status === "done" ? (task.doneAt || new Date().toISOString()) : (task.doneAt || null),
    reminder_at: task.reminderAt || null,
    status,
    activity_id: task.activityId || prev?.activity_id || "",
    created_by: task.createdBy || savedBy || prev?.created_by || "",
  };
  if (task.createdAt) body.created_at = task.createdAt;
  else if (!prev?.created_at && prev?.created) body.created_at = prev.created;
  const isNew = !task.id;
  const prevDueNorm = prev?.due_at ? normalizeDueAtMsk(prev.due_at) : "";
  const nextDueNorm = task.dueAt ? normalizeDueAtMsk(task.dueAt) : "";
  const dueRescheduled = !isNew && prev && prevDueNorm && nextDueNorm && nextDueNorm !== prevDueNorm && status !== "done";
  if (dueRescheduled) body.due_email_sent_at = null;
  else if (isNew) body.due_email_sent_at = null;
  if (dueRescheduled && !fromAmo) {
    const comment = String(task.rescheduleComment || "").trim();
    if (!comment) {
      const err = new Error("Укажите причину переноса задачи");
      err.status = 400;
      throw err;
    }
  }
  let row;
  async function persistTaskPayload(payload) {
    if (task.id) return updateRecord("deal_tasks", task.id, payload);
    return createRecord("deal_tasks", payload);
  }
  try {
    row = await persistTaskPayload(body);
  } catch (e) {
    if (!body.created_at) throw e;
    const fallback = { ...body };
    delete fallback.created_at;
    row = await persistTaskPayload(fallback);
  }
  if (fromAmo) {
    return mapTask(row, dealId);
  }
  if (isNew) {
    await addActivity(dealId, {
      type: "task_created",
      body: `Задача: ${task.title}`,
      author: savedBy,
      refId: row.id,
      at: task.createdAt || undefined,
    });
  }
  const prevDue = prev?.due_at ? String(prev.due_at) : "";
  const nextDue = task.dueAt ? String(task.dueAt) : "";
  if (dueRescheduled) {
    const comment = fromAmo ? "" : String(task.rescheduleComment || "").trim();
    const reasonLine = comment ? `\nПричина: ${comment}` : "";
    await addActivity(dealId, {
      type: "task_rescheduled",
      body: `Задача «${task.title || prev.title || ""}» перенесена с ${fmtDueRu(prevDue)} на ${fmtDueRu(nextDue)}${reasonLine}`,
      author: savedBy,
      refId: row.id,
      at: new Date().toISOString(),
    });
  }
  if (status === "done" && !isNew) {
    const doneBody = task.result
      ? `Выполнено: ${task.title}\n${task.result}`
      : `Выполнено: ${task.title}`;
    await addActivity(dealId, {
      type: "task_done",
      body: doneBody,
      author: savedBy,
      refId: row.id,
      at: task.doneAt || undefined,
    });
  }
  return mapTask(row, dealId);
}

async function listNextTaskDueByDeal() {
  const rows = await listAll("deal_tasks", { filter: 'status="open"', sort: "due_at" });
  const dealRows = await listAll("deals", { fields: "id,deal_id" });
  const dealMap = Object.fromEntries(dealRows.map(d => [d.id, d.deal_id]));
  const out = {};
  rows.forEach(r => {
    const dealId = dealMap[r.deal];
    if (!dealId || !r.due_at) return;
    const due = String(r.due_at).slice(0, 10);
    if (!out[dealId] || due < out[dealId]) out[dealId] = due;
  });
  return out;
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

async function uploadDealFile(dealId, file, { label, uploadedBy, skipActivity, fileName } = {}) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  const rawName = decodeUploadFilename(fileName || file.originalname || file.name || "file");
  const row = await uploadRecord("deal_files", {
    deal: pbId,
    label: label || "Файл",
    original_name: ensureFileExtension(rawName, file.mimetype || ""),
    size: file.size || 0,
    mime_type: file.mimetype || "",
    uploaded_by: uploadedBy || "",
    uploaded_at: new Date().toISOString(),
  }, { file: file.buffer, fileName: file.originalname || file.name });
  const mapped = mapFile(row, dealId);
  if (!skipActivity) {
    await addActivity(dealId, {
      type: "file_uploaded",
      body: `Файл: ${mapped.originalName} (${mapped.label})`,
      author: uploadedBy,
      refId: row.id,
    });
  }
  return mapped;
}

async function uploadDealFileBuffer(dealId, { buffer, originalName, mimeType, label, uploadedBy } = {}) {
  if (!buffer?.length) throw new Error("Empty file");
  return uploadDealFile(dealId, {
    buffer,
    size: buffer.length,
    mimetype: mimeType || "application/octet-stream",
    originalname: originalName || "file",
    name: originalName || "file",
  }, { label: label || "Kaiten", uploadedBy: uploadedBy || "kaiten", skipActivity: true, fileName: originalName });
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
    product_itmen: info.productItmen || "",
    endpoints: info.endpoints || "",
    procurement_format: info.procurementFormat || "",
    registration_deadline: info.registrationDeadline || null,
    infrastructure_size: info.infrastructureSize || "",
    grade: info.grade || "",
    closing_tool: info.closingTool || "",
    functional_fit: info.functionalFit || "",
    test_start: info.testStart || null,
    test_end: info.testEnd || null,
    distributor: info.distributor || "",
    activity_kind: info.activityKind || "",
    test_os: info.testOs || "",
    planned_payment_date: info.plannedPaymentDate || null,
    shipment_date: info.shipmentDate || null,
    project_map_url: info.projectMapUrl || "",
    abm_tier: info.abmTier || "",
    contract_term: info.contractTerm || "",
  };
  const existing = await findOne("deal_info", `deal="${pbId}"`);
  const row = existing
    ? await updateRecord("deal_info", existing.id, body)
    : await createRecord("deal_info", body);
  return mapInfo(row, dealId);
}

async function getDealCrmBundle(dealId) {
  const { getAccessToken } = require("./amo-client");
  const { resolveCrmPersonDisplay } = require("./amo-users");
  let token = null;
  try { token = await getAccessToken(); } catch (_) { /* offline */ }

  const [activities, tasks, files, contacts, info] = await Promise.all([
    listActivities(dealId),
    listTasks(dealId),
    listFiles(dealId),
    listContacts(dealId),
    getDealInfo(dealId),
  ]);
  const dealRow = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  const ownerFallback = dealRow?.owner || "";

  const resolvedActivities = await Promise.all(activities.map(async a => ({
    ...a,
    author: await resolveCrmPersonDisplay(a.author, token, { fallback: ownerFallback }) || a.author,
  })));
  const resolvedTasks = await Promise.all(tasks.map(async t => ({
    ...t,
    assignee: await resolveCrmPersonDisplay(t.assignee, token, { fallback: ownerFallback }) || t.assignee,
  })));

  return {
    activities: resolvedActivities,
    tasks: resolvedTasks,
    files,
    contacts,
    info,
  };
}

async function addCommentWithFile(dealId, { body, author, authorEmail, file, label, uploadedBy }) {
  const pbId = await resolveDealPbId(dealId);
  if (!pbId) throw new Error("Сделка не найдена");
  const attachments = [];
  if (file) {
    const mapped = await uploadDealFile(dealId, file, {
      label: label || "Файл",
      uploadedBy: uploadedBy || author,
      skipActivity: true,
    });
    attachments.push({
      id: mapped.id,
      name: mapped.originalName,
      url: mapped.url,
      size: mapped.size,
      label: mapped.label,
    });
  }
  const text = String(body || "").trim();
  const activityBody = text || (attachments.length ? "Прикреплён файл" : "");
  const row = await createRecord("deal_activities", {
    deal: pbId,
    activity_type: attachments.length ? "comment" : "comment",
    body: activityBody,
    author: author || "",
    author_email: authorEmail || "",
    meta_json: attachments.length ? JSON.stringify({ files: attachments }) : "",
    activity_at: new Date().toISOString(),
    ref_id: "",
  });
  return mapActivity(row, dealId);
}

const KP_DOC_LABELS = { kp: "КП", tkp: "ТКП", excel: "КП (Excel)" };

function fmtKpAmountRub(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("ru-RU") + " ₽";
}

async function getKpPrefill(dealId, deal) {
  const info = await getDealInfo(dealId);
  const owner = (deal && deal.owner) || "";
  let managerEmail = "";
  let managerPhone = "";
  const managers = await listAll("pipeline_users");
  const pu = managers.find(m => (m.manager_name || "") === owner);
  if (pu) {
    managerEmail = pu.email || "";
    const prof = await findOne("user_profiles", `user_id="${String(pu.id).replace(/"/g, '\\"')}"`);
    if (prof) managerPhone = prof.phone || "";
  }
  const partner = (deal && deal.partner) || "";
  const partnerName = partner && partner !== "Нет партнёра" ? partner : "";
  return {
    clientName: (deal && deal.customer) || info?.companyName || "",
    endpoints: info?.endpoints || "",
    managerName: owner,
    managerEmail,
    managerPhone,
    partnerName,
    partnerDiscount: deal?.partnerDiscount ?? 0,
  };
}

async function uploadKpExport(dealId, file, { docType, amountWithVat, uploadedBy, fileName }) {
  const dtype = docType || "kp";
  const label = KP_DOC_LABELS[dtype] || "КП";
  const mapped = await uploadDealFile(dealId, file, {
    label: "КП",
    uploadedBy,
    skipActivity: true,
    fileName: fileName || file.originalname || file.name,
  });
  const docLabel = label;
  const amount = fmtKpAmountRub(amountWithVat);
  const activity = await addActivity(dealId, {
    type: "kp_issued",
    body: `выставил ${docLabel} на ${amount} с НДС`,
    author: uploadedBy,
    refId: mapped.id,
    meta: { docType: dtype, amountWithVat: Number(amountWithVat) || 0, fileName: mapped.originalName },
  });
  return { file: mapped, activity };
}

module.exports = {
  resolveDealPbId,
  listActivities,
  addActivity,
  upsertDealActivity,
  cleanupLegacyAmoTaskActivities,
  listTasks,
  listAllTasks,
  listNextTaskDueByDeal,
  saveTask,
  deleteTask,
  listFiles,
  uploadDealFile,
  uploadDealFileBuffer,
  deleteDealFile,
  listContacts,
  saveContacts,
  getDealInfo,
  saveDealInfo,
  getDealCrmBundle,
  getKpPrefill,
  uploadKpExport,
  ensureFileExtension,
  addCommentWithFile,
};
