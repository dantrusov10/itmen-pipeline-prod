/* CRM API — PocketBase backend */
async function crmFetch(path, opts = {}, attempt = 0) {
  const headers = { ...(opts.headers || {}), ...authHeaders() };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opts, headers });
  } catch (e) {
    const net = /failed to fetch|networkerror|load failed/i.test(String(e.message || e));
    if (net && attempt < 2) {
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      return crmFetch(path, opts, attempt + 1);
    }
    throw new Error(net ? "Нет связи с сервером" : (e.message || "Ошибка сети"));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiLoadDealCrm(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/crm`);
}

async function apiPostComment(dealId, body, file, label) {
  if (file) {
    const fd = new FormData();
    fd.append("body", body || "");
    fd.append("file", file);
    fd.append("label", label || "Файл");
    return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/activities`, { method: "POST", body: fd });
  }
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/activities`, {
    method: "POST",
    body: { body },
  });
}

async function apiLogSystemEvent(dealId, { type = "system", body, meta } = {}) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/activities`, {
    method: "POST",
    body: { type, body, meta: meta || {} },
  });
}

async function apiSaveTask(dealId, task) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/tasks`, {
    method: "POST",
    body: { task },
  });
}

async function apiDeleteTask(dealId, taskId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/tasks/${taskId}`, { method: "DELETE" });
}

async function apiUploadDealFile(dealId, file, label) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("label", label || "Файл");
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/files`, { method: "POST", body: fd });
}

async function apiDeleteDealFile(dealId, fileId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/files/${fileId}`, { method: "DELETE" });
}

async function apiDownloadDealFile(dealId, fileId, fileName, mimeType) {
  const headers = { ...(typeof authHeaders === "function" ? authHeaders() : {}) };
  const res = await fetch(`/api/deals/${encodeURIComponent(dealId)}/files/${encodeURIComponent(fileId)}/download`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || res.statusText || "Ошибка скачивания");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ensureDownloadFilename(fileName, mimeType || res.headers.get("content-type") || blob.type);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function ensureDownloadFilename(name, mimeType) {
  const KNOWN = /\.(pdf|xlsx?|docx?|pptx?|txt|csv|png|jpe?g|gif|webp|zip|rar|7z)$/i;
  let n = String(name || "file").trim() || "file";
  if (KNOWN.test(n)) return n;
  const map = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "image/png": ".png",
    "image/jpeg": ".jpg",
  };
  const mime = String(mimeType || "").split(";")[0].trim();
  const ext = map[mime] || "";
  if (ext && !n.toLowerCase().endsWith(ext)) return n + ext;
  return n;
}

async function apiSaveContacts(dealId, contacts) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/contacts`, {
    method: "PUT",
    body: { contacts },
  });
}

async function apiSaveDealInfo(dealId, info) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/info`, {
    method: "PUT",
    body: { info },
  });
}

async function apiLoadPilotRequirements(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/pilot-requirements`);
}

async function apiSavePilotRequirements(dealId, rows) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/pilot-requirements`, {
    method: "PUT",
    body: { rows },
  });
}

async function apiLoadKpPrefill(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/kp/prefill`);
}

async function apiLoadOwnerCandidates() {
  return crmFetch("/api/users/owners");
}

async function apiLoadAmoUserMap() {
  return crmFetch("/api/amo/user-map");
}

async function apiLoadProductRequirements(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/product-requirements`);
}

async function apiSaveProductRequirements(dealId, rows) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/product-requirements`, {
    method: "PUT",
    body: { rows },
  });
}

async function apiCalendarTasks(params = {}) {
  const q = new URLSearchParams(params).toString();
  return crmFetch(`/api/calendar/tasks?${q}`);
}

async function apiLoadDealNextTaskDue() {
  return crmFetch("/api/tasks/next-due");
}

async function apiGlobalSearch(q) {
  return crmFetch(`/api/search?q=${encodeURIComponent(q)}`);
}

async function apiCheckDuplicates(customer, exclude) {
  const q = new URLSearchParams({ customer, exclude: exclude || "" });
  return crmFetch(`/api/deals/duplicates?${q}`);
}

async function apiTransferDeal(dealId, owner) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/transfer`, {
    method: "POST",
    body: { owner },
  });
}

async function apiArchiveDeal(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}`, { method: "DELETE" });
}

async function apiListViews(page) {
  return crmFetch(`/api/views?page=${encodeURIComponent(page || "")}`);
}

async function apiSaveView(view) {
  return crmFetch("/api/views", { method: "POST", body: { view } });
}

async function apiListNotifications(unreadOnly) {
  return crmFetch(`/api/notifications${unreadOnly ? "?unread=1" : ""}`);
}

async function apiMarkNotificationsRead(ids, all) {
  return crmFetch("/api/notifications/read", { method: "POST", body: { ids, all } });
}

async function apiGetProfile() {
  return crmFetch("/api/profile");
}

async function apiUpdateProfile(patch) {
  return crmFetch("/api/profile", { method: "PATCH", body: patch });
}

async function apiChangePassword(oldPassword, newPassword) {
  return crmFetch("/api/profile/password", {
    method: "POST",
    body: { oldPassword, newPassword },
  });
}

async function apiChangeEmail(email, password) {
  return crmFetch("/api/profile/email", {
    method: "POST",
    body: { email, password },
  });
}

async function apiUploadAvatar(file) {
  const fd = new FormData();
  fd.append("avatar", file);
  return crmFetch("/api/profile/avatar", { method: "POST", body: fd });
}

async function apiAdminListUsers() {
  return crmFetch("/api/admin/users");
}

async function apiAdminSaveUser(body, id) {
  if (id) {
    return crmFetch(`/api/admin/users/${id}`, { method: "PATCH", body });
  }
  return crmFetch("/api/admin/users", { method: "POST", body });
}

async function apiAdminDeleteUser(id) {
  return crmFetch(`/api/admin/users/${id}`, { method: "DELETE" });
}

async function apiBulkDeals(action, dealIds, value) {
  return crmFetch("/api/admin/deals/bulk", {
    method: "POST",
    body: { action, dealIds, value },
  });
}

async function apiReportEntities() {
  return crmFetch("/api/reports/entities");
}

async function apiListReportPresets() {
  return crmFetch("/api/reports/presets");
}

async function apiSaveReportPreset(preset) {
  return crmFetch("/api/reports/presets", { method: "POST", body: { preset } });
}

async function apiRunReport(spec) {
  return crmFetch("/api/reports/run", { method: "POST", body: spec });
}

async function apiKanbanConfig() {
  return crmFetch("/api/kanban/config");
}

async function apiSaveKanbanConfig(payload) {
  const body = Array.isArray(payload) ? { stages: payload } : (payload || {});
  return crmFetch("/api/kanban/config", { method: "PUT", body });
}

async function apiSaveScoring(items) {
  return crmFetch("/api/admin/scoring", { method: "PUT", body: { items } });
}

async function apiLoadPresale(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/presale`);
}

async function apiSavePresale(dealId, presale, opts = {}) {
  const payload = { ...(presale || {}) };
  const syncSales = opts.syncSales ?? payload.syncSales;
  if ("syncSales" in payload) delete payload.syncSales;
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/presale`, {
    method: "PATCH",
    body: { presale: payload, syncSales: syncSales !== false },
  });
}

async function apiLoadPresaleActivities(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/presale/activities`);
}

async function apiPostPresaleActivity(dealId, payload) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/presale/activities`, {
    method: "POST",
    body: payload,
  });
}

async function apiLoadAvatars() {
  return crmFetch("/api/profile/avatars");
}

const avatarBlobCache = new Map();

async function apiFetchAvatarBlobUrl(path) {
  const src = String(path || "").trim();
  if (!src) return "";
  if (avatarBlobCache.has(src)) return avatarBlobCache.get(src);
  const headers = typeof authHeaders === "function" ? authHeaders() : {};
  const res = await fetch(src, { headers, credentials: "same-origin" });
  if (!res.ok) return "";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  avatarBlobCache.set(src, url);
  return url;
}

async function apiLoadAvatarsResolved() {
  const { map } = await apiLoadAvatars();
  const resolved = {};
  const entries = Object.entries(map || {}).filter(([, url]) => url);
  await Promise.all(entries.map(async ([name, path]) => {
    const blobUrl = await apiFetchAvatarBlobUrl(path);
    if (!blobUrl) return;
    resolved[name] = blobUrl;
  }));
  return resolved;
}

function invalidateAvatarBlobCache() {
  for (const url of avatarBlobCache.values()) {
    try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
  }
  avatarBlobCache.clear();
}

window.apiLoadDealCrm = apiLoadDealCrm;
window.apiPostComment = apiPostComment;
window.apiLogSystemEvent = apiLogSystemEvent;
window.apiSaveTask = apiSaveTask;
window.apiDeleteTask = apiDeleteTask;
window.apiUploadDealFile = apiUploadDealFile;
window.apiDeleteDealFile = apiDeleteDealFile;
window.apiDownloadDealFile = apiDownloadDealFile;
window.apiSaveContacts = apiSaveContacts;
window.apiSaveDealInfo = apiSaveDealInfo;
window.apiCalendarTasks = apiCalendarTasks;
window.apiLoadDealNextTaskDue = apiLoadDealNextTaskDue;
window.apiGlobalSearch = apiGlobalSearch;
window.apiCheckDuplicates = apiCheckDuplicates;
window.apiTransferDeal = apiTransferDeal;
window.apiArchiveDeal = apiArchiveDeal;
window.apiListViews = apiListViews;
window.apiSaveView = apiSaveView;
window.apiListNotifications = apiListNotifications;
window.apiMarkNotificationsRead = apiMarkNotificationsRead;
window.apiGetProfile = apiGetProfile;
window.apiUpdateProfile = apiUpdateProfile;
window.apiChangePassword = apiChangePassword;
window.apiChangeEmail = apiChangeEmail;
window.apiUploadAvatar = apiUploadAvatar;
window.apiAdminListUsers = apiAdminListUsers;
window.apiAdminSaveUser = apiAdminSaveUser;
window.apiAdminDeleteUser = apiAdminDeleteUser;
window.apiBulkDeals = apiBulkDeals;
window.apiReportEntities = apiReportEntities;
window.apiListReportPresets = apiListReportPresets;
window.apiSaveReportPreset = apiSaveReportPreset;
window.apiRunReport = apiRunReport;
window.apiKanbanConfig = apiKanbanConfig;
window.apiSaveKanbanConfig = apiSaveKanbanConfig;
window.apiSaveScoring = apiSaveScoring;
window.apiLoadPresale = apiLoadPresale;
window.apiSavePresale = apiSavePresale;
window.apiLoadPresaleActivities = apiLoadPresaleActivities;
window.apiPostPresaleActivity = apiPostPresaleActivity;
window.apiLoadAvatars = apiLoadAvatars;
window.apiFetchAvatarBlobUrl = apiFetchAvatarBlobUrl;
window.apiLoadAvatarsResolved = apiLoadAvatarsResolved;
window.invalidateAvatarBlobCache = invalidateAvatarBlobCache;
