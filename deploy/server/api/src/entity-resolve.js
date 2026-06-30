"use strict";

const { findOne, createRecord, updateRecord, listAll } = require("./pb-client");

function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/^(ооо|оао|зао|пао|ао|ип)\s+/i, "").replace(/\s+/g, " ");
}

function normEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function normPhone(s) {
  return String(s || "").replace(/\D/g, "").slice(-10);
}

function companyKey({ name, inn }) {
  const i = String(inn || "").replace(/\D/g, "");
  if (i) return `inn:${i}`;
  const n = normName(name);
  return n ? `name:${n}` : "";
}

function contactKey({ name, email, phone }) {
  const e = normEmail(email);
  if (e) return `email:${e}`;
  const p = normPhone(phone);
  const n = normName(name);
  if (p && n) return `phone:${p}:${n}`;
  if (n) return `name:${n}`;
  return "";
}

async function findEntity(collection, normKey) {
  if (!normKey) return null;
  return findOne(collection, `norm_key="${normKey.replace(/"/g, '\\"')}"`);
}

async function upsertEntity(collection, normKey, payload) {
  const existing = await findEntity(collection, normKey);
  const body = { norm_key: normKey, ...payload };
  if (existing) {
    const patch = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v != null && v !== "" && v !== existing[k]) patch[k] = v;
    }
    if (Object.keys(patch).length) return updateRecord(collection, existing.id, patch);
    return existing;
  }
  return createRecord(collection, body);
}

async function resolveCompany({ name, inn, kpp, ogrn, address, amoCompanyId } = {}) {
  const key = companyKey({ name, inn });
  if (!key) return null;
  try {
    return await upsertEntity("crm_companies", key, {
      name: String(name || "").trim(),
      inn: String(inn || "").trim(),
      kpp: String(kpp || "").trim(),
      ogrn: String(ogrn || "").trim(),
      address: String(address || "").trim(),
      amo_company_id: Number(amoCompanyId) || 0,
    });
  } catch (_) {
    return null;
  }
}

async function resolveContact({ name, email, phone, role, amoContactId } = {}) {
  const key = contactKey({ name, email, phone });
  if (!key) return null;
  try {
    return await upsertEntity("crm_contacts", key, {
      name: String(name || "").trim(),
      email: normEmail(email),
      phone: String(phone || "").trim(),
      role: String(role || "").trim(),
      amo_contact_id: Number(amoContactId) || 0,
    });
  } catch (_) {
    return null;
  }
}

async function suggestEntities(type, q, limit = 15) {
  const query = String(q || "").trim().toLowerCase();
  const coll = type === "company" ? "crm_companies" : "crm_contacts";
  let rows = [];
  try {
    rows = await listAll(coll, { sort: "name" });
  } catch (_) {
    return [];
  }
  const filtered = rows.filter(r => {
    if (!query) return true;
    const hay = `${r.name || ""} ${r.inn || ""} ${r.email || ""} ${r.phone || ""}`.toLowerCase();
    return hay.includes(query);
  });
  return filtered.slice(0, limit).map(r => ({
    id: r.id,
    name: r.name,
    inn: r.inn || "",
    email: r.email || "",
    phone: r.phone || "",
  }));
}

async function linkContactsOnSave(contacts) {
  const linked = [];
  for (const c of contacts || []) {
    const entity = await resolveContact(c);
    linked.push({ ...c, entityId: entity?.id || "" });
  }
  return linked;
}

async function linkCompanyOnSave(info) {
  if (!info) return info;
  const entity = await resolveCompany({
    name: info.companyName,
    inn: info.companyInn,
    kpp: info.companyKpp,
    ogrn: info.companyOgrn,
    address: info.companyAddress,
  });
  return { ...info, companyEntityId: entity?.id || "" };
}

module.exports = {
  resolveCompany,
  resolveContact,
  suggestEntities,
  linkContactsOnSave,
  linkCompanyOnSave,
  companyKey,
  contactKey,
};
