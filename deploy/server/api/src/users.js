"use strict";

const { listAll, findOne, createRecord, updateRecord, deleteRecord, uploadRecord, getFileUrl } = require("./pb-client");

async function getOrCreateProfile(user) {
  let row = await findOne("user_profiles", `user_id="${user.id}"`);
  if (!row) {
    row = await createRecord("user_profiles", {
      user_id: user.id,
      email: user.email,
      notify_email: true,
      notify_task_due: true,
      notify_deal_assigned: true,
      notify_comments: true,
    });
  }
  return mapProfile(row);
}

function mapProfile(row) {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email || "",
    phone: row.phone || "",
    notifyEmail: row.notify_email !== false,
    notifyTaskDue: row.notify_task_due !== false,
    notifyDealAssigned: row.notify_deal_assigned !== false,
    notifyComments: row.notify_comments !== false,
    avatarUrl: row.avatar ? `/api/profile/avatar/${row.user_id}` : "",
  };
}

async function updateProfile(userId, patch) {
  const row = await findOne("user_profiles", `user_id="${userId}"`);
  if (!row) throw new Error("Профиль не найден");
  const body = {};
  if (patch.phone != null) body.phone = patch.phone;
  if (patch.notifyEmail != null) body.notify_email = !!patch.notifyEmail;
  if (patch.notifyTaskDue != null) body.notify_task_due = !!patch.notifyTaskDue;
  if (patch.notifyDealAssigned != null) body.notify_deal_assigned = !!patch.notifyDealAssigned;
  if (patch.notifyComments != null) body.notify_comments = !!patch.notifyComments;
  const updated = await updateRecord("user_profiles", row.id, body);
  return mapProfile(updated);
}

async function uploadAvatar(userId, file) {
  const row = await findOne("user_profiles", `user_id="${userId}"`);
  if (!row) throw new Error("Профиль не найден");
  if (row.avatar) {
    await updateRecord("user_profiles", row.id, { avatar: null });
  }
  const updated = await uploadRecord("user_profiles", {}, {
    file: file.buffer,
    fileName: file.originalname || "avatar.png",
    fileField: "avatar",
  }, row.id);
  return mapProfile(updated);
}

async function changePassword(token, oldPassword, newPassword) {
  const PB_URL = process.env.PB_URL || "http://127.0.0.1:8095";
  const res = await fetch(`${PB_URL}/api/collections/pipeline_users/auth-refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const auth = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Сессия истекла");
  const userId = auth.record?.id;
  if (!userId) throw new Error("Пользователь не найден");
  const check = await fetch(`${PB_URL}/api/collections/pipeline_users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: auth.record.email, password: oldPassword }),
  });
  if (!check.ok) throw new Error("Неверный текущий пароль");
  const { ensureAuth, updateRecord: adminUpdate } = require("./pb-client");
  await ensureAuth();
  await adminUpdate("pipeline_users", userId, {
    password: newPassword,
    passwordConfirm: newPassword,
  });
  return { ok: true };
}

async function changeEmail(token, password, newEmail) {
  const email = String(newEmail || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Некорректный логин (email)");
  }
  if (!password) throw new Error("Укажите пароль для подтверждения");

  const PB_URL = process.env.PB_URL || "http://127.0.0.1:8095";
  const res = await fetch(`${PB_URL}/api/collections/pipeline_users/auth-refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const auth = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Сессия истекла");
  const userId = auth.record?.id;
  const oldEmail = auth.record?.email;
  if (!userId || !oldEmail) throw new Error("Пользователь не найден");
  if (email === oldEmail.toLowerCase()) throw new Error("Новый логин совпадает с текущим");

  const check = await fetch(`${PB_URL}/api/collections/pipeline_users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: oldEmail, password }),
  });
  if (!check.ok) throw new Error("Неверный пароль");

  const dup = await findOne("pipeline_users", `email="${email.replace(/"/g, '\\"')}"`);
  if (dup && dup.id !== userId) throw new Error("Этот логин уже занят");

  const { ensureAuth, updateRecord: adminUpdate } = require("./pb-client");
  await ensureAuth();
  await adminUpdate("pipeline_users", userId, { email });

  const prof = await findOne("user_profiles", `user_id="${userId}"`);
  if (prof) await updateRecord("user_profiles", prof.id, { email });

  const { loginUser } = require("./auth");
  const session = await loginUser(email, password);
  return { email, token: session.token, user: session.user };
}

async function listUsers() {
  const rows = await listAll("pipeline_users", { sort: "email" });
  return rows.map(u => ({
    id: u.id,
    email: u.email,
    role: u.role || "manager",
    managerName: u.manager_name || "",
    displayName: u.display_name || u.email,
    verified: u.verified,
  }));
}

async function createUser({ email, password, role, managerName, displayName }) {
  const row = await createRecord("pipeline_users", {
    email,
    password,
    passwordConfirm: password,
    role: role || "manager",
    manager_name: managerName || "",
    display_name: displayName || managerName || email,
    verified: true,
  });
  await createRecord("user_profiles", {
    user_id: row.id,
    email: row.email,
    notify_email: true,
    notify_task_due: true,
    notify_deal_assigned: true,
    notify_comments: true,
  });
  return { id: row.id, email: row.email, role: row.role };
}

async function updateUser(userId, patch) {
  const body = {};
  if (patch.role != null) body.role = patch.role;
  if (patch.managerName != null) body.manager_name = patch.managerName;
  if (patch.displayName != null) body.display_name = patch.displayName;
  if (patch.password) {
    body.password = patch.password;
    body.passwordConfirm = patch.password;
  }
  const row = await updateRecord("pipeline_users", userId, body);
  return { id: row.id, email: row.email, role: row.role };
}

async function deleteUser(userId) {
  await deleteRecord("pipeline_users", userId);
  const prof = await findOne("user_profiles", `user_id="${userId}"`);
  if (prof) await deleteRecord("user_profiles", prof.id);
  return { ok: true };
}

async function listAdminOwners() {
  const users = await listAll("pipeline_users", { filter: 'role="admin"' });
  const names = new Set();
  users.forEach(u => {
    const mn = String(u.manager_name || "").trim();
    const dn = String(u.display_name || "").trim();
    if (mn) names.add(mn);
    if (dn) names.add(dn);
  });
  return [...names].sort((a, b) => a.localeCompare(b, "ru"));
}

async function listOwnerCandidates() {
  const users = await listAll("pipeline_users", { sort: "email" });
  const managerRows = await listAll("managers", { sort: "name" });
  const ownerListRows = await listAll("list_items", { filter: 'list_key="owners"' });
  const byKey = new Map();
  const add = n => {
    const display = String(n || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    if (!display) return;
    const key = normalizeOwnerKey(display);
    if (!byKey.has(key)) byKey.set(key, display);
  };
  users.forEach(u => {
    const mn = String(u.manager_name || "").trim();
    const dn = String(u.display_name || "").trim();
    if (mn) add(mn);
    else if (dn) add(dn);
    else if (u.email) add(String(u.email).split("@")[0]);
  });
  managerRows.forEach(m => add(m.name));
  ownerListRows.forEach(r => add(r.value));
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "ru"));
}

function normalizeOwnerKey(name) {
  return String(name || "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .toLowerCase();
}

function resolveOwnerName(name, candidates) {
  const key = normalizeOwnerKey(name);
  if (!key) return "";
  const list = candidates || [];
  const hit = list.find(c => normalizeOwnerKey(c) === key);
  return hit || String(name || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

async function listAvatarsByManager() {
  const users = await listAll("pipeline_users");
  const profiles = await listAll("user_profiles");
  const profileByUser = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  const map = {};
  const put = (name, url) => {
    const display = String(name || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    if (!display || !url) return;
    map[display] = url;
    const key = normalizeOwnerKey(display);
    if (key) map[key] = url;
  };
  users.forEach(u => {
    const prof = profileByUser[u.id];
    if (!prof?.avatar) return;
    const url = `/api/profile/avatar/${u.id}`;
    put(u.manager_name, url);
    put(u.display_name, url);
    if (u.manager_name && u.display_name && normalizeOwnerKey(u.manager_name) !== normalizeOwnerKey(u.display_name)) {
      put(u.display_name, url);
    }
    const emailLocal = String(u.email || "").split("@")[0];
    if (emailLocal) put(emailLocal, url);
  });
  return map;
}

module.exports = {
  getOrCreateProfile,
  updateProfile,
  uploadAvatar,
  changePassword,
  changeEmail,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listAvatarsByManager,
  listAdminOwners,
  listOwnerCandidates,
  normalizeOwnerKey,
  resolveOwnerName,
};
