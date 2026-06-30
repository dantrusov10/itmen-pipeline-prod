"use strict";

const { listAll, createRecord, updateRecord } = require("./pb-client");

function mapNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title || "",
    message: row.message || "",
    link: row.link || "",
    read: Boolean(row.read),
    createdAt: row.created_at || row.created,
    type: row.type || "",
  };
}

async function listNotifications(userId, { unreadOnly = false } = {}) {
  let filter = `user_id="${userId}"`;
  if (unreadOnly) filter += " && read=false";
  const rows = await listAll("notifications", { filter, sort: "-created_at,-created" });
  return rows.map(mapNotification);
}

async function createNotification({ userId, title, message, link, type }) {
  const row = await createRecord("notifications", {
    user_id: userId,
    title: title || "",
    message: message || "",
    link: link || "",
    read: false,
    created_at: new Date().toISOString(),
    type: type || "info",
  });
  return mapNotification(row);
}

async function markRead(userId, ids) {
  for (const id of ids || []) {
    const rows = await listAll("notifications", {
      filter: `id="${id}" && user_id="${userId}"`,
      perPage: 1,
    });
    if (rows[0]) await updateRecord("notifications", rows[0].id, { read: true });
  }
  return { ok: true };
}

async function markAllRead(userId) {
  const rows = await listAll("notifications", { filter: `user_id="${userId}" && read=false` });
  for (const row of rows) await updateRecord("notifications", row.id, { read: true });
  return { ok: true, count: rows.length };
}

async function notifyUserByEmail(email, payload) {
  const users = await listAll("pipeline_users", {
    filter: `email="${email.replace(/"/g, '\\"')}"`,
    perPage: 1,
  });
  if (!users[0]) return null;
  return createNotification({ userId: users[0].id, ...payload });
}

async function notifyUserByManagerName(managerName, payload) {
  const target = String(managerName || "").trim();
  if (!target) return null;
  const key = target.normalize("NFC").toLowerCase();
  const users = await listAll("pipeline_users");
  const hit = users.find(u => String(u.manager_name || "").trim().normalize("NFC").toLowerCase() === key);
  if (!hit) return null;
  return createNotification({ userId: hit.id, ...payload });
}

module.exports = {
  listNotifications,
  createNotification,
  markRead,
  markAllRead,
  notifyUserByEmail,
  notifyUserByManagerName,
};
