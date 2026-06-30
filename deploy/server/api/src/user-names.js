"use strict";

const { listAll } = require("./pb-client");
const { normalizeOwnerKey } = require("./users");

function personKey(name) {
  const parts = normalizeOwnerKey(name).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return normalizeOwnerKey(name);
  return [...parts].sort().join(" ");
}

function buildAuthorResolver(users) {
  const byKey = new Map();
  const byPerson = new Map();
  const admins = [];

  for (const u of users || []) {
    const canon = String(u.manager_name || u.display_name || "").trim()
      .replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    if (!canon) continue;
    if ((u.role || "") === "admin") admins.push(u);

    const addAlias = alias => {
      const a = String(alias || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
      if (!a) return;
      const k = normalizeOwnerKey(a);
      const pk = personKey(a);
      if (k && !byKey.has(k)) byKey.set(k, canon);
      if (pk && !byPerson.has(pk)) byPerson.set(pk, canon);
    };

    addAlias(canon);
    addAlias(u.display_name);
    addAlias(u.manager_name);
    if (u.email) addAlias(String(u.email).split("@")[0]);
  }

  const genericAdmin = () => {
    if (admins.length === 1) {
      const u = admins[0];
      return String(u.manager_name || u.display_name || "").trim();
    }
    return "";
  };

  return raw => {
    const s = String(raw || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    if (!s) return "";
    const k = normalizeOwnerKey(s);
    if (byKey.has(k)) return byKey.get(k);
    const pk = personKey(s);
    if (byPerson.has(pk)) return byPerson.get(pk);
    if (k === "администратор" || k === "admin" || k === "web" || k === "administrator") {
      const ga = genericAdmin();
      if (ga) return ga;
    }
    return s;
  };
}

async function loadAuthorResolver() {
  const users = await listAll("pipeline_users", { sort: "email" });
  return buildAuthorResolver(users);
}

function dedupeAuthors(names) {
  const byPerson = new Map();
  for (const n of names || []) {
    const resolved = String(n || "").trim();
    if (!resolved) continue;
    const pk = personKey(resolved);
    if (!byPerson.has(pk)) byPerson.set(pk, resolved);
  }
  return [...byPerson.values()].sort((a, b) => a.localeCompare(b, "ru"));
}

module.exports = { buildAuthorResolver, loadAuthorResolver, dedupeAuthors, personKey };
