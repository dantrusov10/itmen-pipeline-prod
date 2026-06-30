"use strict";

const { getKaitenConfig } = require("./kaiten-config");

async function kaitenRequest(path, { method = "GET", body } = {}) {
  const cfg = getKaitenConfig();
  if (!cfg.enabled) throw new Error("Kaiten integration disabled");
  const headers = {
    Authorization: `Bearer ${cfg.apiToken}`,
    Accept: "application/json",
  };
  let payload;
  if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${cfg.apiUrl}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || text || `Kaiten HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function listBoardCards(limit = 500) {
  const cfg = getKaitenConfig();
  return kaitenRequest(`/cards?board_id=${cfg.boardId}&limit=${limit}`);
}

async function getCard(cardId) {
  return kaitenRequest(`/cards/${cardId}`);
}

async function createCard(payload) {
  return kaitenRequest("/cards", { method: "POST", body: payload });
}

async function updateCard(cardId, payload) {
  return kaitenRequest(`/cards/${cardId}`, { method: "PATCH", body: payload });
}

async function listCardComments(cardId) {
  return kaitenRequest(`/cards/${cardId}/comments`);
}

async function createCardComment(cardId, text, { authorName = "CRM" } = {}) {
  const body = String(text || "").trim();
  if (!body) return null;
  return kaitenRequest(`/cards/${cardId}/comments`, {
    method: "POST",
    body: { text: body, author_name: authorName },
  });
}

async function setCardResponsible(cardId, userId) {
  if (!userId) return null;
  return kaitenRequest(`/cards/${cardId}/members`, {
    method: "POST",
    body: { user_id: userId, type: 2 },
  });
}

async function clearCardResponsible(cardId) {
  const card = await getCard(cardId);
  const members = Array.isArray(card?.members) ? card.members : [];
  for (const m of members) {
    const uid = m?.user_id || m?.id;
    if (!uid) continue;
    try {
      await kaitenRequest(`/cards/${cardId}/members/${uid}`, { method: "DELETE" });
    } catch (_) { /* ignore */ }
  }
}

async function listCardFiles(cardId) {
  return kaitenRequest(`/cards/${cardId}/files`);
}

async function downloadFileUrl(url) {
  const cfg = getKaitenConfig();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
  });
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, mimeType: res.headers.get("content-type") || "application/octet-stream" };
}

module.exports = {
  kaitenRequest,
  listBoardCards,
  getCard,
  createCard,
  updateCard,
  listCardComments,
  createCardComment,
  setCardResponsible,
  clearCardResponsible,
  listCardFiles,
  downloadFileUrl,
};
