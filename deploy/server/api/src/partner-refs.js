"use strict";

const { listAll } = require("./pb-client");

const SKIP_VALUES = new Set([
  "",
  "нет партнёра",
  "нет партнера",
  "нет дистрибьютора",
  "без партнёра",
  "без партнера",
]);

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/ё/g, "е");
}

function isSkipped(name) {
  return SKIP_VALUES.has(norm(name));
}

function addItem(map, name, source) {
  const n = String(name || "").trim();
  if (!n || isSkipped(n)) return;
  const key = norm(n);
  if (!map.has(key)) {
    map.set(key, { name: n, sources: new Set() });
  }
  if (source) map.get(key).sources.add(source);
}

async function searchPartnerRefs(q = "", limit = 40) {
  const query = norm(q);
  const map = new Map();

  const listKeys = ["partners", "distributors"];
  for (const listKey of listKeys) {
    const rows = await listAll("list_items", {
      filter: `list_key="${listKey}"`,
      sort: "sort_order",
    });
    for (const row of rows) {
      const name = row.value;
      if (query && !norm(name).includes(query)) continue;
      addItem(map, name, listKey);
    }
  }

  const refDeals = await listAll("deals", {
    filter: 'deal_type~"ref:"',
    fields: "customer,deal_type,partner",
    sort: "customer",
  });
  for (const row of refDeals) {
    const name = row.customer || row.partner;
    if (query && !norm(name).includes(query)) continue;
    const src = String(row.deal_type || "").includes("tech") ? "tech_partners" : "partners";
    addItem(map, name, src);
  }

  const dealRows = await listAll("deals", {
    fields: "partner",
    sort: "-updated",
  });
  for (const row of dealRows) {
    if (query && !norm(row.partner).includes(query)) continue;
    addItem(map, row.partner, "deals");
  }

  let infoRows = [];
  try {
    infoRows = await listAll("deal_info", { fields: "distributor", sort: "-updated" });
  } catch (_) { /* collection may be empty */ }
  for (const row of infoRows) {
    if (query && !norm(row.distributor).includes(query)) continue;
    addItem(map, row.distributor, "deal_info");
  }

  const items = [...map.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map(x => ({
      name: x.name,
      sources: [...x.sources],
    }));

  if (!query) {
    const presets = ["Нет партнёра", "Нет дистрибьютора"];
    for (const p of presets) {
      if (!items.some(i => norm(i.name) === norm(p))) {
        items.unshift({ name: p, sources: ["preset"], preset: true });
      }
    }
  }

  return items;
}

module.exports = { searchPartnerRefs, norm, isSkipped };
