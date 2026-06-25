/* CRM API — PocketBase backend */
async function crmFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}), ...authHeaders() };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiLoadDealCrm(dealId) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/crm`);
}

async function apiPostComment(dealId, body) {
  return crmFetch(`/api/deals/${encodeURIComponent(dealId)}/activities`, {
    method: "POST",
    body: { body },
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

async function apiCalendarTasks(params = {}) {
  const q = new URLSearchParams(params).toString();
  return crmFetch(`/api/calendar/tasks?${q}`);
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

async function apiSaveKanbanConfig(stages) {
  return crmFetch("/api/kanban/config", { method: "PUT", body: { stages } });
}

async function apiSaveScoring(items) {
  return crmFetch("/api/admin/scoring", { method: "PUT", body: { items } });
}

async function apiLoadAvatars() {
  return crmFetch("/api/profile/avatars");
}

window.apiLoadDealCrm = apiLoadDealCrm;
window.apiPostComment = apiPostComment;
window.apiSaveTask = apiSaveTask;
window.apiDeleteTask = apiDeleteTask;
window.apiUploadDealFile = apiUploadDealFile;
window.apiDeleteDealFile = apiDeleteDealFile;
window.apiSaveContacts = apiSaveContacts;
window.apiSaveDealInfo = apiSaveDealInfo;
window.apiCalendarTasks = apiCalendarTasks;
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
window.apiLoadAvatars = apiLoadAvatars;
