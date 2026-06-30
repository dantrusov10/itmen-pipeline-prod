"use strict";

const { amoGetAll } = require("./amo-client");
const { listOwnerCandidates, normalizeOwnerKey } = require("./users");

const DEFAULT_OWNER = "Трусов Данила";

const AMO_NAME_ALIASES = {
  "гадир гадиров": "Гадиров Гадир",
  "гадиров гадир": "Гадиров Гадир",
  "иван лашин": "Иван Лашин",
  "лашин иван": "Иван Лашин",
  "трусов данила": "Трусов Данила",
  "данила трусов": "Трусов Данила",
  "мерлейн аркадий": "Аркадий Мерлейн",
  "аркадий мерлейн": "Аркадий Мерлейн",
  "сироткин александр": "Александр Сироткин",
  "александр сироткин": "Александр Сироткин",
  "кулагин алексей": "Алексей Кулагин",
  "алексей кулагин": "Алексей Кулагин",
  "ахметшин арслан": "Арслан Ахметшин",
  "арслан ахметшин": "Арслан Ахметшин",
};

/** Fallback ids when Amo /users omits inactive accounts (legacy duplicates → one CRM person) */
const AMO_ID_OVERRIDES = {
  "12718890": "Аркадий Мерлейн",
  "12862130": "Алексей Кулагин",
  "12165090": "Алексей Кулагин",
  /** Два legacy Amo-id одного Александра Сироткина (старый + новый аккаунт) */
  "13526614": "Александр Сироткин",
  "13297858": "Александр Сироткин",
};

let amoUsersById = null;
let amoUsersLoadedAt = 0;
let candidatesCache = null;
let candidatesLoadedAt = 0;
let idToCrmCache = null;
let idToCrmLoadedAt = 0;
const CACHE_MS = 60 * 60 * 1000;

function reversedNameKey(name) {
  const parts = normalizeOwnerKey(name).split(" ").filter(Boolean);
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return "";
}

function findCandidate(name, candidates) {
  const key = normalizeOwnerKey(name);
  if (!key) return "";
  const list = candidates || [];
  const direct = list.find(c => normalizeOwnerKey(c) === key);
  if (direct) return direct;
  const rev = reversedNameKey(name);
  if (rev) {
    const hit = list.find(c => normalizeOwnerKey(c) === rev);
    if (hit) return hit;
  }
  if (AMO_NAME_ALIASES[key]) return AMO_NAME_ALIASES[key];
  if (rev && AMO_NAME_ALIASES[rev]) return AMO_NAME_ALIASES[rev];
  return "";
}

async function ensureOwnerCandidates() {
  if (candidatesCache && Date.now() - candidatesLoadedAt < CACHE_MS) return candidatesCache;
  candidatesCache = await listOwnerCandidates();
  candidatesLoadedAt = Date.now();
  return candidatesCache;
}

async function ensureAmoUsers(token) {
  if (!token) return amoUsersById || new Map();
  if (amoUsersById && Date.now() - amoUsersLoadedAt < CACHE_MS) return amoUsersById;
  try {
    const users = await amoGetAll("/api/v4/users", token);
    const map = new Map();
    for (const u of users) {
      const name = [u.name, u.last_name].filter(Boolean).join(" ").trim();
      if (u.id != null && name) map.set(String(u.id), name);
    }
    amoUsersById = map;
    amoUsersLoadedAt = Date.now();
    idToCrmCache = null;
    idToCrmLoadedAt = 0;
  } catch (e) {
    console.warn("amo users load:", e.message);
    if (!amoUsersById) amoUsersById = new Map();
  }
  return amoUsersById;
}

async function buildAmoIdToCrmMap(token) {
  if (idToCrmCache && Date.now() - idToCrmLoadedAt < CACHE_MS) return idToCrmCache;
  const candidates = await ensureOwnerCandidates();
  await ensureAmoUsers(token);
  const out = { ...AMO_ID_OVERRIDES };
  const unmapped = [];

  for (const [id, amoName] of (amoUsersById || new Map()).entries()) {
    const crm = findCandidate(amoName, candidates);
    if (crm) out[id] = crm;
    else {
      out[id] = amoName;
      unmapped.push({ id, amoName });
    }
  }

  for (const [id, crmName] of Object.entries(AMO_ID_OVERRIDES)) {
    if (!out[id]) out[id] = crmName;
  }

  idToCrmCache = { map: out, unmapped };
  idToCrmLoadedAt = Date.now();
  return idToCrmCache;
}

async function resolveNameFromAmoId(id, token, candidates) {
  const s = String(id || "").trim();
  if (!/^\d+$/.test(s)) return "";
  const { map } = await buildAmoIdToCrmMap(token);
  const raw = map[s] || amoUsersById?.get(s) || "";
  if (!raw) return "";
  return findCandidate(raw, candidates) || raw;
}

/**
 * Map Amo user id / name to CRM manager name.
 * defaultIfMissing: empty or unknown → Трусов Данила
 */
async function resolveCrmPersonFromAmo(raw, token, { defaultIfMissing = false } = {}) {
  const candidates = await ensureOwnerCandidates();
  const s = String(raw || "").trim();
  if (!s) return defaultIfMissing ? DEFAULT_OWNER : "";

  if (/^\d+$/.test(s)) {
    const hit = await resolveNameFromAmoId(s, token, candidates);
    if (hit && !/^\d+$/.test(hit)) return hit;
    return defaultIfMissing ? DEFAULT_OWNER : "";
  }

  const hit = findCandidate(s, candidates);
  if (hit) return hit;
  if (defaultIfMissing) return DEFAULT_OWNER;
  return s;
}

/** Resolve stored assignee/author (may be numeric id from old sync). */
async function resolveCrmPersonDisplay(raw, token, { fallback = "" } = {}) {
  const candidates = await ensureOwnerCandidates();
  const s = String(raw || "").trim();
  if (!s) return fallback || "";
  if (s === "amo-sync" || s === "amo") return s;

  if (/^\d+$/.test(s)) {
    const hit = await resolveNameFromAmoId(s, token, candidates);
    if (hit && !/^\d+$/.test(hit)) return hit;
    const fb = String(fallback || "").trim();
    if (fb && !/^\d+$/.test(fb)) return findCandidate(fb, candidates) || fb;
    return s;
  }

  return findCandidate(s, candidates) || s;
}

function invalidateAmoUsersCache() {
  amoUsersById = null;
  amoUsersLoadedAt = 0;
  candidatesCache = null;
  candidatesLoadedAt = 0;
  idToCrmCache = null;
  idToCrmLoadedAt = 0;
}

async function getAmoUserIdMap(token) {
  const { map, unmapped } = await buildAmoIdToCrmMap(token);
  return { byId: map, unmapped };
}

async function auditAmoUserMappings(token) {
  const candidates = await ensureOwnerCandidates();
  const { map, unmapped } = await buildAmoIdToCrmMap(token);
  const mapped = [];
  for (const [id, crmName] of Object.entries(map)) {
    const inCrm = candidates.some(c => normalizeOwnerKey(c) === normalizeOwnerKey(crmName));
    mapped.push({ id, crmName, inCrm });
  }
  return { mapped, unmapped, crmCandidates: candidates };
}

module.exports = {
  DEFAULT_OWNER,
  ensureAmoUsers,
  ensureOwnerCandidates,
  resolveCrmPersonFromAmo,
  resolveCrmPersonDisplay,
  findCandidate,
  invalidateAmoUsersCache,
  getAmoUserIdMap,
  buildAmoIdToCrmMap,
  auditAmoUserMappings,
};
