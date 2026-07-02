"use strict";

const { calcDealScore, calcCategory, normalizeManualProb } = require("./metrics");

const SUCCESS_STAGES = ["Успешно реализовано", "Документы подписаны", "Отгружен"];
const COMMIT_LABELS = {
  none: "Нет",
  verbal: "Устное",
  email: "Email",
  protocol: "Протокол",
  loi: "LOI",
  guarantee: "Гарантийное письмо",
  contract: "Контракт",
};

function parseListQuery(raw = {}) {
  let filters = {};
  if (raw.filters) {
    try {
      filters = typeof raw.filters === "string" ? JSON.parse(raw.filters) : raw.filters;
    } catch {
      filters = {};
    }
  }
  let adminOwners = [];
  if (raw.adminOwners) {
    try {
      adminOwners = typeof raw.adminOwners === "string" ? JSON.parse(raw.adminOwners) : raw.adminOwners;
    } catch {
      adminOwners = [];
    }
  }
  return {
    q: String(raw.q || "").trim(),
    mine: raw.mine === "1" || raw.mine === true,
    filters,
    sortKey: String(raw.sortKey || "amount").trim(),
    sortDir: raw.sortDir === "asc" ? "asc" : "desc",
    presaleWs: raw.presaleWs === "1" || raw.presaleWs === true,
    adminOwners: Array.isArray(adminOwners) ? adminOwners : [],
    page: Math.max(1, Number(raw.page) || 1),
    perPage: Math.min(200, Math.max(1, Number(raw.perPage) || 100)),
  };
}

function hasActiveListQuery(q) {
  if (!q) return false;
  if (q.q) return true;
  if (q.mine) return true;
  if (q.filters && Object.keys(q.filters).some(k => {
    const v = q.filters[k];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && String(v).trim() !== "";
  })) return true;
  return false;
}

function manualProbDisplayPct(v) {
  const p = normalizeManualProb(v);
  if (!p) return null;
  return Math.round(p * 100);
}

function commitLabel(commitStatus) {
  if (!commitStatus) return "—";
  return COMMIT_LABELS[commitStatus] || String(commitStatus);
}

function cellText(key, d) {
  switch (key) {
    case "customer": return d.customer || "";
    case "stage": return d.stage || "—";
    case "owner": return String(d.owner || "").trim() || "—";
    case "presaleOwner": return String(d.presale?.owner || d.presale_owner || "").trim() || "—";
    case "presaleStage": return String(d.presale?.stage || d.presale_stage || "").trim() || "—";
    case "amount": return Number(d.amount) || 0;
    case "score": return d._tableScore ?? d.score ?? null;
    case "category": return d._tableCategory ?? d.category ?? "—";
    case "manualProb": return manualProbDisplayPct(d.manualProb);
    case "budgetStatus": return d.budgetStatus || "Неизвестно";
    case "budgetPeriod": return d.budgetPeriod || "Не определён";
    case "commitStatus": return d.commitLabel || commitLabel(d.commitStatus);
    case "partner": return (d.partner || "").trim() || "Без партнёра";
    case "industry": return String(d.industry || "").trim() || "—";
    case "taskDue": return String(d.taskDue || "").trim();
    case "expectedBudget": return Number(d.expectedBudget) || 0;
    case "weighted": return d._tableWeighted ?? d.weighted ?? 0;
    case "partnerDiscount": return Number(d.partnerDiscount) || 0;
    case "dealType": return d.dealType || "—";
    case "riskFlag": return d.riskFlag || "—";
    case "passportPct": return d._tablePassportPct ?? null;
    default: return String(d[key] ?? "").trim() || "—";
  }
}

function taskStatus(d) {
  const due = String(d.taskDue || "").trim();
  if (!due) return "Нет задачи";
  if (d.daysTo != null && d.daysTo < 0) return "Просрочена";
  return "Есть задача";
}

function getMultiselect(filters, key) {
  const v = filters[key];
  return Array.isArray(v) ? v : (v ? [v] : []);
}

function parseFilterNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function matchRange(key, d, filters) {
  const from = parseFilterNum(filters[`${key}__from`]);
  const to = parseFilterNum(filters[`${key}__to`]);
  if (from == null && to == null) return true;
  const val = cellText(key, d);
  if (val == null) return false;
  const n = Number(val);
  if (!Number.isFinite(n)) return false;
  if (from != null && n < from) return false;
  if (to != null && n > to) return false;
  return true;
}

function matchCol(key, d, filters, colFilter) {
  if (colFilter === "range") return matchRange(key, d, filters);
  if (colFilter === "multiselect") {
    const selected = getMultiselect(filters, key);
    if (!selected.length) return true;
    if (key === "taskStatus") return selected.includes(taskStatus(d));
    if (key === "industry") {
      const raw = String(d.industry || "").trim();
      if (!raw) return selected.includes("—");
      const parts = raw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      return parts.some(p => selected.includes(p)) || selected.includes(raw);
    }
    return selected.includes(String(cellText(key, d)));
  }
  const f = String(filters[key] || "").trim();
  if (!f) return true;
  const text = String(cellText(key, d));
  if (colFilter === "select" || colFilter === "select-dynamic") return text === f;
  return text.toLowerCase().includes(f.toLowerCase());
}

const COL_FILTERS = {
  customer: "text",
  stage: "multiselect",
  owner: "multiselect",
  presaleOwner: "multiselect",
  presaleStage: "multiselect",
  amount: "range",
  score: "range",
  category: "multiselect",
  manualProb: "range",
  budgetStatus: "multiselect",
  budgetPeriod: "multiselect",
  commitStatus: "multiselect",
  partner: "multiselect",
  industry: "multiselect",
  taskDue: "text",
  taskStatus: "multiselect",
  expectedBudget: "range",
  weighted: "range",
  partnerDiscount: "range",
  dealType: "multiselect",
  riskFlag: "multiselect",
  passportPct: "range",
};

function ownerNamesMatch(a, b) {
  const x = String(a || "").trim().normalize("NFC").toLowerCase();
  const y = String(b || "").trim().normalize("NFC").toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function isDealMine(d, user) {
  const self = String(user?.managerName || user?.displayName || "").trim();
  if (!self) return false;
  const presale = String(d.presale?.owner || d.presale_owner || "").trim();
  if (presale && ownerNamesMatch(presale, self)) return true;
  const owner = String(d.owner || "").trim();
  return Boolean(owner && ownerNamesMatch(owner, self));
}

function applyDefaultExcludes(deals, query) {
  let rows = deals;
  const stageSel = getMultiselect(query.filters, "stage");
  const ownerSel = getMultiselect(query.filters, "owner");

  if (query.presaleWs) {
    if (!stageSel.includes("Отказ")) {
      rows = rows.filter(d => {
        const st = String(d.presale?.stage || d.presale_stage || "").trim();
        return st !== "Отказ";
      });
    }
  } else {
    if (!stageSel.includes("Отказ")) {
      rows = rows.filter(d => (d.stage || "") !== "Отказ");
    }
    if (!SUCCESS_STAGES.some(s => stageSel.includes(s))) {
      rows = rows.filter(d => !SUCCESS_STAGES.includes(d.stage || ""));
    }
    const admins = new Set(query.adminOwners || []);
    const ownerHasAdmin = ownerSel.some(o => admins.has(o));
    if (admins.size && !ownerHasAdmin && !query.mine) {
      rows = rows.filter(d => !admins.has(d.owner || ""));
    }
  }
  return rows;
}

function applySearch(deals, q) {
  const term = String(q || "").trim().toLowerCase();
  if (!term) return deals;
  return deals.filter(d => {
    const parts = [
      d.customer, d.id, d.owner, d.stage, d.industry, d.partner,
      d.presale?.owner, d.presale?.stage, d.dealType,
      d.amoId != null ? `amo ${d.amoId}` : "",
      d.amoId != null ? String(d.amoId) : "",
      ...Object.keys(COL_FILTERS).map(k => cellText(k, d)),
    ];
    String(d.customer || "").split(/[()/,]/).forEach(t => { if (t.trim()) parts.push(t.trim()); });
    return parts.join(" ").toLowerCase().includes(term);
  });
}

function applyColFilters(deals, filters) {
  let rows = deals;
  for (const [key, colFilter] of Object.entries(COL_FILTERS)) {
    const active = colFilter === "range"
      ? (filters[`${key}__from`] || filters[`${key}__to`])
      : colFilter === "multiselect"
        ? getMultiselect(filters, key).length
        : filters[key];
    if (!active) continue;
    rows = rows.filter(d => matchCol(key, d, filters, colFilter));
  }
  return rows;
}

function sortDeals(deals, sortKey, sortDir) {
  const dir = sortDir === "asc" ? 1 : -1;
  const key = COL_FILTERS[sortKey] ? sortKey : "amount";
  const numeric = ["amount", "score", "manualProb", "expectedBudget", "weighted", "partnerDiscount", "passportPct"].includes(key);
  return [...deals].sort((a, b) => {
    const av = cellText(key, a);
    const bv = cellText(key, b);
    if (numeric) {
      const an = av == null ? -Infinity : Number(av);
      const bn = bv == null ? -Infinity : Number(bv);
      return (an - bn) * dir;
    }
    return String(av).localeCompare(String(bv), "ru") * dir;
  });
}

function filterAndPaginateDeals(deals, rawQuery, user) {
  const query = parseListQuery(rawQuery);
  let rows = applyDefaultExcludes(deals, query);
  rows = applyColFilters(rows, query.filters);
  rows = applySearch(rows, query.q);
  if (query.mine) rows = rows.filter(d => isDealMine(d, user));
  rows = sortDeals(rows, query.sortKey, query.sortDir);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / query.perPage));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.perPage;
  return {
    deals: rows.slice(start, start + query.perPage),
    pagination: { page, perPage: query.perPage, total, totalPages },
    listQuery: query,
  };
}

module.exports = {
  parseListQuery,
  hasActiveListQuery,
  filterAndPaginateDeals,
};
