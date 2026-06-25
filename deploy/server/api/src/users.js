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

module.exports = {
  getOrCreateProfile,
  updateProfile,
  uploadAvatar,
  changePassword,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
};
