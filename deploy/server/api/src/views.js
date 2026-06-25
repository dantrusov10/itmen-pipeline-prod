"use strict";

const { listAll, createRecord, updateRecord, deleteRecord } = require("./pb-client");

function mapView(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name || "",
    page: row.page || "deals",
    spec: safeJson(row.spec_json),
    isDefault: Boolean(row.is_default),
  };
}

function safeJson(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

async function listViews(userId, page) {
  let filter = `user_id="${userId}"`;
  if (page) filter += ` && page="${page}"`;
  const rows = await listAll("saved_views", { filter, sort: "name" });
  return rows.map(mapView);
}

async function saveView(userId, view) {
  const body = {
    user_id: userId,
    name: view.name || "Вид",
    page: view.page || "deals",
    spec_json: JSON.stringify(view.spec || {}),
    is_default: Boolean(view.isDefault),
  };
  if (view.isDefault) {
    const existing = await listAll("saved_views", {
      filter: `user_id="${userId}" && page="${body.page}" && is_default=true`,
    });
    for (const row of existing) {
      await updateRecord("saved_views", row.id, { is_default: false });
    }
  }
  const row = view.id
    ? await updateRecord("saved_views", view.id, body)
    : await createRecord("saved_views", body);
  return mapView(row);
}

async function deleteView(userId, viewId) {
  const rows = await listAll("saved_views", {
    filter: `id="${viewId}" && user_id="${userId}"`,
    perPage: 1,
  });
  if (rows[0]) await deleteRecord("saved_views", rows[0].id);
  return { ok: true };
}

module.exports = { listViews, saveView, deleteView };
