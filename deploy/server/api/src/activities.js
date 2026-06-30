"use strict";

const { listAll } = require("./pb-client");
const { calcDealScore } = require("./metrics");
const { FIELD_LABELS } = require("./audit-labels");
const { loadAuthorResolver, dedupeAuthors } = require("./user-names");
const {
  buildScoreImpactMap,
  labelToFieldKey,
  parseScoresJson,
  parseProbFromAudit,
} = require("./score-engine");

const ACTIVITY_TYPE_META = {
  stage_change: { section: "Сделка", subsection: "Стадия", action: "Изменение стадии" },
  loss_reason: { section: "Сделка", subsection: "Отказ", action: "Причина отказа" },
  owner_changed: { section: "Сделка", subsection: "Владелец", action: "Смена владельца" },
  deal_assigned: { section: "Сделка", subsection: "Владелец", action: "Назначение" },
  field_change: { section: "Сделка", subsection: "Поле", action: "Изменение поля" },
  archive: { section: "Сделка", subsection: "Архив", action: "Архивация" },
  unarchive: { section: "Сделка", subsection: "Архив", action: "Восстановление" },
  kp_issued: { section: "КП", subsection: "Выгрузка", action: "Выгрузка КП/ТКП" },
  file_uploaded: { section: "Файлы", subsection: "Загрузка", action: "Загрузка файла" },
  task_created: { section: "Задачи", subsection: "Создание", action: "Новая задача" },
  task_rescheduled: { section: "Задачи", subsection: "Срок", action: "Перенос задачи" },
  task_done: { section: "Задачи", subsection: "Выполнение", action: "Задача выполнена" },
  contacts_change: { section: "Контакты", subsection: "Изменение", action: "Изменение контактов" },
  info_change: { section: "Общая информация", subsection: "Изменение", action: "Изменение информации" },
  comment: { section: "События", subsection: "Комментарий", action: "Комментарий" },
};

const FIELD_SECTION = {
  customer: ["Паспорт", "Клиент"],
  industry: ["Паспорт", "Отрасль"],
  owner: ["Паспорт", "Владелец"],
  stage: ["Сделка", "Стадия"],
  amount: ["Финансы", "Ожид. сумма"],
  expectedBudget: ["Финансы", "Бюджет"],
  partner: ["Партнёр", "Партнёр"],
  partnerDiscount: ["Финансы", "Скидка партнёру"],
  clientDiscount: ["Финансы", "Скидка клиенту"],
  manualProb: ["Финансы", "Вероятность"],
  taskDue: ["Задачи", "Срок задачи"],
  budgetPeriod: ["Финансы", "Срок бюджета"],
  budgetStatus: ["Финансы", "Статус бюджета"],
  budgetPlannedMonth: ["Финансы", "Месяц согласования"],
  budgetPlannedYear: ["Финансы", "Год согласования"],
  commitStatus: ["Коммит", "Статус коммита"],
  pains: ["Паспорт", "Боли"],
  riskTypes: ["Риски", "Типы риска"],
  riskComment: ["Риски", "Комментарий"],
  scores: ["Скоринг", "Баллы"],
  seekingSegments: ["Тех. исследование", "Сегменты"],
  seekingOtherLabel: ["Тех. исследование", "Другое"],
  productRequirementsPct: ["Требования", "Продукт"],
  pilotRequirementsPct: ["Требования", "Пилот"],
  asIsStack: ["Тех. исследование", "As-IS"],
  changePains: ["Тех. исследование", "Почему меняют"],
  competitorEntries: ["Тех. исследование", "Конкуренты"],
  projectTasks: ["Тех. исследование", "Задачи проекта"],
};

function sectionForAuditRow(row) {
  if (row.is_new_deal) return { section: "Сделка", subsection: "Создание", action: "Новая сделка" };
  const key = labelToFieldKey(row.label);
  if (key && FIELD_SECTION[key]) {
    const [section, subsection] = FIELD_SECTION[key];
    return { section, subsection, action: row.label };
  }
  if (row.label === "Скоринг") return { section: "Скоринг", subsection: "Баллы", action: "Скоринг" };
  return { section: "Сделка", subsection: "Поле", action: row.label || "Изменение" };
}

function scoreDeltaFromScores(oldScores, newScores, oldProb, newProb) {
  const oldS = calcDealScore(oldScores, oldProb);
  const newS = calcDealScore(newScores, newProb);
  if (oldS == null && newS == null) return null;
  return (newS ?? 0) - (oldS ?? 0);
}

function formatScoreImpactDelta(delta) {
  if (delta == null) return null;
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatAtMsk(at) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) {
    const s = String(at).replace("T", " ").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    if (m) return m[4] != null ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : `${m[3]}.${m[2]}.${m[1]}`;
    return s.slice(0, 16);
  }
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value || "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

function scoreImpactFromAuditRow(row, impactById) {
  if (impactById && row.id && impactById[row.id] != null) {
    return impactById[row.id];
  }
  if (row.label === "Скоринг" || row.label === FIELD_LABELS.scores) {
    const delta = scoreDeltaFromScores(
      parseScoresJson(row.old_value),
      parseScoresJson(row.new_value),
      0, 0,
    );
    return formatScoreImpactDelta(delta);
  }
  if (row.label === FIELD_LABELS.manualProb) {
    const delta = scoreDeltaFromScores(
      {},
      {},
      parseProbFromAudit(row.old_value),
      parseProbFromAudit(row.new_value),
    );
    return formatScoreImpactDelta(delta);
  }
  return null;
}

function previewVal(v, max = 120) {
  const s = v == null ? "" : String(v);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function mapAuditRow(row, resolveAuthor, impactById) {
  const meta = sectionForAuditRow(row);
  const author = resolveAuthor ? resolveAuthor(row.saved_by || "") : String(row.saved_by || "").trim();
  const scoreImpact = scoreImpactFromAuditRow(row, impactById);
  return {
    id: `audit:${row.id}`,
    source: "audit",
    at: row.at,
    atDisplay: formatAtMsk(row.at),
    user: author || "—",
    authorRaw: row.saved_by || "",
    dealId: row.deal_id || "",
    customer: row.customer || "",
    owner: row.owner || "",
    section: meta.section,
    subsection: meta.subsection,
    action: meta.action,
    field: row.label || "",
    oldValue: previewVal(row.old_value),
    newValue: previewVal(row.new_value),
    scoreImpact,
    scoreImpactNum: parseScoreImpactNum(scoreImpact),
    isNewDeal: !!row.is_new_deal,
  };
}

function mapActivityRow(row, dealMeta, resolveAuthor) {
  const meta = ACTIVITY_TYPE_META[row.activity_type] || {
    section: "События",
    subsection: row.activity_type || "—",
    action: row.activity_type || "Событие",
  };
  const rawAuthor = row.author || row.author_email || "";
  const author = resolveAuthor ? resolveAuthor(rawAuthor) : String(rawAuthor).trim();
  return {
    id: `activity:${row.id}`,
    source: "activity",
    at: row.activity_at || row.created,
    atDisplay: formatAtMsk(row.activity_at || row.created),
    user: author || "—",
    authorRaw: rawAuthor,
    dealId: dealMeta?.deal_id || "",
    customer: dealMeta?.customer || "",
    owner: dealMeta?.owner || "",
    section: meta.section,
    subsection: meta.subsection,
    action: meta.action,
    field: meta.action,
    oldValue: "",
    newValue: previewVal(row.body),
    scoreImpact: null,
    scoreImpactNum: null,
    activityType: row.activity_type || "",
  };
}

function endOfDayMskIso(dateStr) {
  return `${String(dateStr).slice(0, 10)}T23:59:59.999+03:00`;
}

function inRange(at, from, to) {
  if (!at) return false;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return false;
  if (from && t < new Date(from).getTime()) return false;
  if (to) {
    const toTs = new Date(to.includes("T") ? to : endOfDayMskIso(to)).getTime();
    if (t > toTs) return false;
  }
  return true;
}

function parseScoreImpactNum(scoreImpact) {
  if (scoreImpact == null || scoreImpact === "") return null;
  if (scoreImpact === "0") return 0;
  const s = String(scoreImpact).trim();
  const n = parseFloat(s.startsWith("+") ? s.slice(1) : s);
  return Number.isFinite(n) ? n : null;
}

function parseRangeNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function matchesScoreImpact(row, opts) {
  const dir = opts.scoreImpactDir || "";
  const n = row.scoreImpactNum;
  const from = parseRangeNum(opts.scoreImpactFrom);
  const to = parseRangeNum(opts.scoreImpactTo);

  if (dir === "up") {
    if (!(n > 0)) return false;
    if (from != null && n < from) return false;
    if (to != null && n > to) return false;
    return true;
  }
  if (dir === "down") {
    if (!(n < 0)) return false;
    const abs = Math.abs(n);
    if (from != null && abs < from) return false;
    if (to != null && abs > to) return false;
    return true;
  }
  if (dir === "zero" && n !== 0) return false;
  if (dir === "changed" && (n == null || n === 0)) return false;
  if (dir === "none" && n != null && n !== 0) return false;
  return true;
}

function matchesFilters(row, opts) {
  const { user, section, subsection, field, dealId, source, q } = opts;
  if (source && source !== "all" && row.source !== source) return false;
  if (dealId && row.dealId !== dealId) return false;
  if (user && !String(row.user || "").toLowerCase().includes(String(user).toLowerCase())
    && !String(row.authorRaw || "").toLowerCase().includes(String(user).toLowerCase())) return false;
  if (section && row.section !== section) return false;
  if (subsection && row.subsection !== subsection) return false;
  if (field && !String(row.field || "").toLowerCase().includes(String(field).toLowerCase())
    && !String(row.action || "").toLowerCase().includes(String(field).toLowerCase())) return false;
  if (!matchesScoreImpact(row, opts)) return false;
  if (q) {
    const hay = [row.user, row.dealId, row.customer, row.owner, row.section, row.subsection,
      row.action, row.field, row.oldValue, row.newValue, row.scoreImpact]
      .join(" ").toLowerCase();
    if (!hay.includes(String(q).toLowerCase())) return false;
  }
  return true;
}

async function listAdminActivities(opts = {}) {
  const from = opts.from || "";
  const to = opts.to || "";
  const limit = Math.min(2000, Math.max(1, Number(opts.limit) || 500));
  const offset = Math.max(0, Number(opts.offset) || 0);

  const auditParts = [];
  if (from) auditParts.push(`at >= "${from.replace(/"/g, "")}"`);
  if (to) auditParts.push(`at <= "${endOfDayMskIso(to).replace(/"/g, "")}"`);
  const auditFilter = auditParts.length ? auditParts.join(" && ") : "";

  const [auditRows, activityRows, dealRows, resolveAuthor] = await Promise.all([
    listAll("audit_log", { filter: auditFilter || undefined, sort: "-at", perPage: 3000 }),
    listAll("deal_activities", { sort: "-activity_at", perPage: 3000 }),
    listAll("deals", { fields: "id,deal_id,customer,owner" }),
    loadAuthorResolver(),
  ]);

  const dealByPbId = Object.fromEntries((dealRows || []).map(d => [d.id, d]));

  const scoreImpactByAuditId = buildScoreImpactMap(auditRows || []);

  let rows = [];
  for (const r of auditRows || []) {
    const mapped = mapAuditRow(r, resolveAuthor, scoreImpactByAuditId);
    if (from || to) {
      if (!inRange(mapped.at, from, to)) continue;
    }
    rows.push(mapped);
  }
  for (const r of activityRows || []) {
    const mapped = mapActivityRow(r, dealByPbId[r.deal], resolveAuthor);
    if (from || to) {
      if (!inRange(mapped.at, from, to)) continue;
    }
    rows.push(mapped);
  }

  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const filtered = rows.filter(r => matchesFilters(r, opts));

  const sections = [...new Set(rows.map(r => r.section))].sort((a, b) => a.localeCompare(b, "ru"));
  const subsections = [...new Set(rows.map(r => r.subsection))].sort((a, b) => a.localeCompare(b, "ru"));
  const users = dedupeAuthors(rows.map(r => r.user).filter(u => u && u !== "—"));

  return {
    ok: true,
    total: filtered.length,
    items: filtered.slice(offset, offset + limit),
    facets: { sections, subsections, users },
  };
}

module.exports = { listAdminActivities };
