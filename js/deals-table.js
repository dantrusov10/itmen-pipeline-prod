/* Таблица сделок — сортировка и фильтрация по каждому столбцу */

function dealTechResearch(d) {
  return typeof migrateTechResearch === "function"
    ? migrateTechResearch(d.techResearch || {})
    : (d.techResearch || {});
}

function dealSeekingLabel(d) {
  const tr = dealTechResearch(d);
  const labels = Object.fromEntries((window.ITMEN_CONFIG?.techSegments || []).map(s => [s.id, s.label]));
  const parts = (tr.seekingSegments || []).map(s =>
    s === "other" ? (tr.seekingOtherLabel?.trim() || "Другое") : (labels[s] || s)
  );
  return parts.join(", ") || "—";
}

function dealCompetitorsSummary(d) {
  const entries = Object.values(dealTechResearch(d).competitorEntries || {}).flat()
    .filter(e => e && (e.vendor || e.product));
  if (!entries.length) return "—";
  const statusLabels = Object.fromEntries((window.ITMEN_CONFIG?.competitorStatuses || []).map(s => [s.id, s.label]));
  const unique = [];
  const seen = new Set();
  entries.forEach(e => {
    const label = `${(e.vendor || "").trim()}${e.product ? " · " + e.product : ""}`.trim() || "—";
    if (seen.has(label)) return;
    seen.add(label);
    const st = statusLabels[e.status] || "";
    unique.push(st ? `${label} (${st})` : label);
  });
  if (unique.length <= 2) return unique.join("; ");
  return `${unique.slice(0, 2).join("; ")} +${unique.length - 2}`;
}

function dealTasksSummary(d) {
  const tasks = (dealTechResearch(d).projectTasks || []).filter(Boolean);
  if (!tasks.length) return "—";
  if (tasks.length === 1) {
    const t = String(tasks[0]);
    return t.length > 36 ? t.slice(0, 34) + "…" : t;
  }
  return `${tasks.length} задач`;
}

function dealPainsPreview(d) {
  const text = String(d.pains || "").trim();
  if (!text) return d.hasPains ? "Есть" : "—";
  return text.length > 40 ? text.slice(0, 38) + "…" : text;
}

function dealTaskStatus(d) {
  const due = (typeof getDealTaskDue === "function" && getDealTaskDue(d.id)) || d.taskDue || "";
  if (!String(due).trim()) return "Нет задачи";
  if (d.daysTo != null && d.daysTo < 0) return "Просрочена";
  return "Есть задача";
}

const DEALS_TABLE_COLS = [
  {
    key: "customer",
    label: "Клиент",
    filter: "text",
    get: d => d.customer,
    render(d) {
      const id = escapeHtml(d.id || "");
      const href = `#deal/${encodeURIComponent(d.id || "")}`;
      return `<td class="col-customer"><a class="deal-page-link" href="${href}" data-deal-id="${id}" data-return="deals" onclick="return dealPageLinkClick(event)"><strong>${escapeHtml(d.customer)}</strong></a></td>`;
    },
  },
  {
    key: "stage",
    label: "Стадия",
    filter: "multiselect",
    filterOptions: deals => resolveStageFilterOptions(deals),
    get: d => d.stage || "—",
    render(d) {
      return `<td class="col-stage"><small>${escapeHtml(d.stage || "—")}</small></td>`;
    },
  },
  {
    key: "owner",
    label: "Владелец",
    filter: "multiselect",
    filterOptions: deals => resolveOwnerFilterOptions(deals),
    get: d => String(d.owner || "").trim() || "—",
    render(d) {
      const name = String(d.owner || "").trim() || "—";
      const av = typeof ownerAvatarHtml === "function" ? ownerAvatarHtml(d.owner) : "";
      return `<td class="col-owner"><span class="owner-cell">${av}${escapeHtml(name)}</span></td>`;
    },
  },
  {
    key: "presaleOwner",
    label: "Отв. пре-сейл",
    filter: "multiselect",
    filterOptions: () => typeof getPresaleStaffNames === "function"
      ? getPresaleStaffNames()
      : (state?.lists?.presale_owners || []),
    get: d => (typeof presaleOwnerForDeal === "function" ? presaleOwnerForDeal(d) : (d.presale?.owner || "")) || "—",
    render(d) {
      const owner = typeof presaleOwnerForDeal === "function" ? presaleOwnerForDeal(d) : (d.presale?.owner || "");
      const av = typeof ownerAvatarHtml === "function" ? ownerAvatarHtml(owner) : "";
      return `<td class="col-presale-owner"><span class="owner-cell">${av}${escapeHtml(owner || "—")}</span></td>`;
    },
  },
  {
    key: "presaleStage",
    label: "Этап пре-сейл",
    filter: "multiselect",
    filterOptions: () => typeof presaleStageOptions === "function" ? presaleStageOptions() : [],
    get: d => (typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : d.presale?.stage) || "—",
    render(d) {
      const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "");
      return `<td class="col-presale-stage"><small>${escapeHtml(st || "—")}</small></td>`;
    },
  },
  {
    key: "amount",
    label: "Ожид. сумма",
    num: true,
    filter: "range",
    get: d => Number(d.amount) || 0,
    render(d) {
      return `<td class="num col-amount">
        ${formatMoney(d.amount)}
        <div class="cell-sub">${d.weighted ? formatMoney(d.weighted) + " взв." : "—"}</div>
      </td>`;
    },
  },
  {
    key: "score",
    label: "Балл",
    num: true,
    filter: "range",
    headerTitle: "Балл 0–100: сумма 9 критериев скоринга (каждый 0–5) с весами, (Σ×вес)/5×100",
    get: d => d.score,
    render(d) {
      return `<td class="num" title="Балл 0–100: (Σ критерий×вес)/5×100">${d.score ?? "—"}</td>`;
    },
  },
  {
    key: "category",
    label: "Категория",
    filter: "multiselect",
    filterOptions: () => ["Горячая", "Тёплая", "Наблюдение", "Отказ"],
    get: d => d.category,
    render(d) {
      return `<td>${categoryBadge(d.category)}</td>`;
    },
  },
  {
    key: "manualProb",
    label: "Вероятность",
    num: true,
    filter: "range",
    get: d => manualProbDisplayPct(d.manualProb),
    render(d) {
      const p = manualProbDisplayPct(d.manualProb);
      return `<td class="num">${p != null ? p + "%" : "—"}</td>`;
    },
  },
  {
    key: "budgetStatus",
    label: "Статус бюджета",
    filter: "multiselect",
    filterOptions: deals => resolveBudgetStatusFilterOptions(deals),
    get: d => d.budgetStatus || "Неизвестно",
    render(d) {
      return `<td><small>${escapeHtml(d.budgetStatus || "—")}</small></td>`;
    },
  },
  {
    key: "budgetPeriod",
    label: "Срок",
    filter: "multiselect",
    msAlign: "right",
    filterOptions: deals => resolveBudgetPeriodFilterOptions(deals),
    get: d => d.budgetPeriod || "Не определён",
    render(d) {
      return `<td class="col-deadline"><small>${escapeHtml(d.budgetPeriod || "—")}</small></td>`;
    },
  },
  {
    key: "commitStatus",
    label: "Статус коммита",
    filter: "multiselect",
    msAlign: "right",
    filterOptions: deals => resolveCommitStatusFilterOptions(deals),
    get: d => d.commitLabel || commitLabel(d.commitStatus),
    sortGet: d => d.commitLabel || commitLabel(d.commitStatus),
    render(d) {
      return `<td><small>${escapeHtml(d.commitLabel || "—")}</small></td>`;
    },
  },
  {
    key: "partner",
    label: "Партнёр",
    filter: "multiselect",
    filterOptions: deals => resolvePartnerFilterOptions(deals),
    get: d => (d.partner || "").trim() || "Без партнёра",
    render(d) {
      return `<td><small>${escapeHtml((d.partner || "").trim() || "—")}</small></td>`;
    },
  },
  {
    key: "industry",
    label: "Отрасль",
    filter: "multiselect",
    filterOptions: deals => resolveIndustryFilterOptions(deals),
    get: d => formatIndustryValues(parseIndustryValues(d.industry)) || "—",
    matchFilter(d, selected) {
      const vals = parseIndustryValues(d.industry);
      if (!vals.length) return selected.includes("—");
      return vals.some(v => selected.includes(v));
    },
    render(d) {
      const text = formatIndustryValues(parseIndustryValues(d.industry)) || "—";
      return `<td><small>${escapeHtml(text)}</small></td>`;
    },
  },
  {
    key: "taskDue",
    label: "Срок задачи",
    filter: "text",
    get: d => (typeof getDealTaskDue === "function" && getDealTaskDue(d.id)) || d.taskDue || "",
    render(d) {
      const due = (typeof getDealTaskDue === "function" && getDealTaskDue(d.id)) || d.taskDue || "";
      const overdue = d.daysTo != null && d.daysTo < 0;
      const dueLabel = due ? (typeof formatRuDate === "function" ? formatRuDate(due) : due) : "—";
      return `<td class="col-date"><small>${escapeHtml(dueLabel)}${d.daysTo != null ? ` <span class="${overdue ? "text-warn" : ""}">(${d.daysTo} дн.)</span>` : ""}</small></td>`;
    },
  },
  {
    key: "taskStatus",
    label: "Задачи",
    filter: "multiselect",
    filterOptions: () => ["Нет задачи", "Есть задача", "Просрочена"],
    get: d => dealTaskStatus(d),
    render(d) {
      const st = dealTaskStatus(d);
      const cls = st === "Просрочена" ? "text-warn" : st === "Нет задачи" ? "muted" : "";
      return `<td><small class="${cls}">${escapeHtml(st)}</small></td>`;
    },
  },
  {
    key: "expectedBudget",
    label: "Ожид. бюджет",
    num: true,
    filter: "range",
    group: "finance",
    get: d => Number(d.expectedBudget) || 0,
    render(d) {
      return `<td class="num">${formatMoney(d.expectedBudget)}</td>`;
    },
  },
  {
    key: "weighted",
    label: "Взвеш.",
    num: true,
    filter: "range",
    group: "finance",
    get: d => d.weighted || 0,
    render(d) {
      return `<td class="num">${d.weighted ? formatMoney(d.weighted) : "—"}</td>`;
    },
  },
  {
    key: "partnerDiscount",
    label: "Скидка партнёру",
    num: true,
    filter: "range",
    group: "finance",
    get: d => Number(d.partnerDiscount) || 0,
    render(d) {
      return `<td class="num">${d.partnerDiscount ? d.partnerDiscount + "%" : "—"}</td>`;
    },
  },
  {
    key: "clientDiscount",
    label: "Скидка клиенту",
    num: true,
    filter: "range",
    group: "finance",
    get: d => Number(d.clientDiscount) || 0,
    render(d) {
      return `<td class="num">${d.clientDiscount ? d.clientDiscount + "%" : "—"}</td>`;
    },
  },
  {
    key: "budgetPlanned",
    label: "План согласования",
    filter: "text",
    group: "finance",
    get: d => {
      if (d.budgetStatus !== "Планируется согласование") return "";
      if (d.budgetPlannedMonth && d.budgetPlannedYear) return `${d.budgetPlannedMonth}/${d.budgetPlannedYear}`;
      return "";
    },
    render(d) {
      const v = d.budgetStatus === "Планируется согласование" && d.budgetPlannedMonth && d.budgetPlannedYear
        ? `${d.budgetPlannedMonth}/${d.budgetPlannedYear}` : "—";
      return `<td><small>${escapeHtml(v)}</small></td>`;
    },
  },
  {
    key: "seeking",
    label: "Что ищут",
    filter: "text",
    group: "tech",
    get: d => dealSeekingLabel(d),
    render(d) {
      const label = dealSeekingLabel(d);
      return `<td title="${escapeHtml(label)}"><small>${escapeHtml(label.length > 28 ? label.slice(0, 26) + "…" : label)}</small></td>`;
    },
  },
  {
    key: "productPct",
    label: "% продукта",
    num: true,
    filter: "range",
    group: "tech",
    get: d => dealTechResearch(d).productRequirementsPct,
    render(d) {
      const v = dealTechResearch(d).productRequirementsPct;
      return `<td class="num">${v != null ? v + "%" : "—"}</td>`;
    },
  },
  {
    key: "pilotPct",
    label: "% пилота",
    num: true,
    filter: "range",
    group: "tech",
    get: d => dealTechResearch(d).pilotRequirementsPct,
    render(d) {
      const v = dealTechResearch(d).pilotRequirementsPct;
      return `<td class="num">${v != null ? v + "%" : "—"}</td>`;
    },
  },
  {
    key: "tasks",
    label: "Ключевые задачи",
    filter: "text",
    group: "tech",
    get: d => dealTasksSummary(d),
    render(d) {
      const label = dealTasksSummary(d);
      const full = (dealTechResearch(d).projectTasks || []).join("\n");
      return `<td title="${escapeHtml(full)}"><small>${escapeHtml(label)}</small></td>`;
    },
  },
  {
    key: "competitors",
    label: "Конкуренты",
    filter: "text",
    group: "tech",
    get: d => dealCompetitorsSummary(d),
    render(d) {
      const label = dealCompetitorsSummary(d);
      return `<td title="${escapeHtml(label)}"><small>${escapeHtml(label.length > 30 ? label.slice(0, 28) + "…" : label)}</small></td>`;
    },
  },
  {
    key: "pains",
    label: "Боли",
    filter: "text",
    group: "tech",
    get: d => dealPainsPreview(d),
    render(d) {
      const label = dealPainsPreview(d);
      return `<td title="${escapeHtml(d.pains || "")}"><small>${escapeHtml(label)}</small></td>`;
    },
  },
  {
    key: "riskFlag",
    label: "Риски",
    filter: "text",
    group: "risks",
    get: d => d.riskFlag || "",
    render(d) {
      return `<td><small>${d.riskFlag ? escapeHtml(d.riskFlag) : "—"}</small></td>`;
    },
  },
  {
    key: "riskComment",
    label: "Комм. риска",
    filter: "text",
    group: "risks",
    get: d => d.riskComment || "",
    render(d) {
      const t = String(d.riskComment || "").trim();
      const short = t.length > 32 ? t.slice(0, 30) + "…" : (t || "—");
      return `<td title="${escapeHtml(t)}"><small>${escapeHtml(short)}</small></td>`;
    },
  },
  {
    key: "lastUpdate",
    label: "Обновлено",
    filter: "text",
    group: "main",
    get: d => d.lastUpdate || "",
    render(d) {
      const lu = d.lastUpdate ? (typeof formatRuDate === "function" ? formatRuDate(d.lastUpdate) : d.lastUpdate) : "—";
      return `<td><small>${escapeHtml(lu)}${d.daysSince != null ? ` (${d.daysSince} дн.)` : ""}</small></td>`;
    },
  },
  {
    key: "amoId",
    label: "ID amoCRM",
    filter: "text",
    group: "crm",
    get: d => d.amoId || "",
    render(d) {
      return `<td><small>${escapeHtml(d.amoId || "—")}</small></td>`;
    },
  },
];

const DEALS_COL_GROUPS = [
  { id: "main", label: "Основное", keys: ["customer", "stage", "owner", "industry", "partner", "taskDue", "taskStatus", "lastUpdate"] },
  { id: "finance", label: "Суммы и бюджет", keys: ["amount", "weighted", "expectedBudget", "partnerDiscount", "clientDiscount", "budgetPeriod", "budgetStatus", "budgetPlanned"] },
  { id: "scoring", label: "Скоринг", keys: ["score", "category", "manualProb", "commitStatus"] },
  { id: "tech", label: "Тех. исследование", keys: ["seeking", "productPct", "pilotPct", "tasks", "competitors", "pains"] },
  { id: "risks", label: "Риски", keys: ["riskFlag", "riskComment"] },
  { id: "crm", label: "CRM", keys: ["amoId"] },
];

const DEALS_COLS_STORAGE_KEY = "itmen_deals_columns_v1";
const DEALS_DEFAULT_VISIBLE_COLS = [
  "customer", "stage", "owner", "amount", "score", "category",
  "manualProb", "budgetStatus", "budgetPeriod", "commitStatus",
];

let dealsVisibleColKeys = loadDealsVisibleColKeys();

let dealsTableSort = { key: "amount", dir: "desc" };
let dealsTableBound = false;
let dealsFilterOpen = false;
let dealsMineOnly = localStorage.getItem("itmen_deals_mine") === "1";

const DYNAMICS_DRILL_PRESETS = new Set(["pipelineDelta", "weightedDelta", "scoreDelta", "dealCountDelta"]);
const PRESALE_DRILL_PRESETS = new Set(["presaleFailed", "dealIds", "presaleActive", "presaleSuccess", "presaleOverdue", "presaleNoStage", "presalePipeline"]);

function presaleRejectFilterActive() {
  const pStage = getMultiselectFilter("presaleStage");
  if (pStage.includes("Отказ")) return true;
  const stage = getMultiselectFilter("stage");
  if (stage.includes("Отказ")) return true;
  if (dealsTablePreset?.type === "presaleFailed") return true;
  return false;
}

function parseFilterNum(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function dealCellText(col, d) {
  const v = (col.sortGet || col.get)(d);
  if (v == null || v === "") return "";
  return String(v);
}

function colSortValue(col, d) {
  const getter = col.sortGet || col.get;
  const v = getter(d);
  if (col.num) {
    if (v == null || v === "") return null;
    return +v;
  }
  return dealCellText(col, d).toLowerCase();
}

function matchRangeFilter(col, d) {
  const from = parseFilterNum(dealsTableColFilters[col.key + "__from"]);
  const to = parseFilterNum(dealsTableColFilters[col.key + "__to"]);
  if (from == null && to == null) return true;
  const raw = col.get(d);
  if (raw == null || raw === "" || (col.key !== "amount" && +raw === 0 && col.key === "manualProb")) {
    return from == null && to == null;
  }
  const n = +raw;
  if (!Number.isFinite(n)) return false;
  if (from != null && n < from) return false;
  if (to != null && n > to) return false;
  return true;
}

function getMultiselectFilter(colKey) {
  const f = dealsTableColFilters[colKey];
  if (!f) return [];
  if (Array.isArray(f)) return f;
  return f ? [String(f)] : [];
}

function resolveStageFilterOptions(deals) {
  const base = state?.lists?.stages || window.ITMEN_INITIAL?.lists?.stages || [];
  const all = [...base];
  if (!all.includes("Отказ")) all.push("Отказ");
  [...new Set((deals || []).map(d => d.stage).filter(Boolean))].forEach(s => {
    if (!all.includes(s)) all.push(s);
  });
  return all;
}

function resolveOwnerFilterOptions(deals) {
  const inactive = ["Павел Витков"];
  const byKey = new Map();
  const add = n => {
    const display = String(n || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    if (!display || inactive.includes(display)) return;
    const key = display.normalize("NFC").toLowerCase();
    if (!byKey.has(key)) byKey.set(key, display);
  };
  if (typeof ownerSelectOptions === "function") ownerSelectOptions().forEach(add);
  else (state?.lists?.owners || []).forEach(add);
  (state?.crmOwners || []).forEach(add);
  (deals || []).forEach(d => add(d.owner));
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "ru"));
}

function resolveBudgetPeriodFilterOptions(deals) {
  const base = state?.lists?.budgetPeriods || window.ITMEN_CONFIG?.budgetPeriods || window.ITMEN_INITIAL?.lists?.budgetPeriods || [];
  const all = [...base];
  [...new Set((deals || []).map(d => d.budgetPeriod).filter(Boolean))].forEach(s => {
    if (!all.includes(s)) all.push(s);
  });
  return all;
}

function resolveBudgetStatusFilterOptions(deals) {
  const base = state?.lists?.budgetStatus || window.ITMEN_CONFIG?.budgetStatuses || [];
  const all = [...base];
  [...new Set((deals || []).map(d => d.budgetStatus).filter(Boolean))].forEach(s => {
    if (!all.includes(s)) all.push(s);
  });
  return all;
}

function resolveCommitStatusFilterOptions(deals) {
  const base = (window.ITMEN_CONFIG?.commitStatuses || []).map(c => c.label);
  const all = [...base];
  (deals || []).forEach(d => {
    const label = d.commitLabel || commitLabel(d.commitStatus);
    if (label && !all.includes(label)) all.push(label);
  });
  return all;
}

function resolvePartnerFilterOptions(deals) {
  const all = [];
  (deals || []).forEach(d => {
    const p = (d.partner || "").trim() || "Без партнёра";
    if (!all.includes(p)) all.push(p);
  });
  return all.sort((a, b) => a.localeCompare(b, "ru"));
}

function resolveIndustryFilterOptions(deals) {
  const set = new Set();
  (deals || []).forEach(d => {
    const vals = typeof parseIndustryValues === "function" ? parseIndustryValues(d.industry) : [d.industry].filter(Boolean);
    vals.forEach(v => set.add(v));
  });
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

function loadDealsVisibleColKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEALS_COLS_STORAGE_KEY) || "null");
    const keys = saved?.visible;
    if (!Array.isArray(keys) || !keys.length) return [...DEALS_DEFAULT_VISIBLE_COLS];
    const valid = keys.filter(k => DEALS_TABLE_COLS.some(c => c.key === k));
    return valid.length ? valid : [...DEALS_DEFAULT_VISIBLE_COLS];
  } catch {
    return [...DEALS_DEFAULT_VISIBLE_COLS];
  }
}

function persistDealsVisibleCols() {
  try {
    localStorage.setItem(DEALS_COLS_STORAGE_KEY, JSON.stringify({ visible: dealsVisibleColKeys }));
  } catch (e) {
    console.warn("persistDealsVisibleCols:", e);
  }
}

function getVisibleDealsCols() {
  const map = Object.fromEntries(DEALS_TABLE_COLS.map(c => [c.key, c]));
  return dealsVisibleColKeys
    .map(k => map[k])
    .filter(Boolean)
    .map(c => adaptDealsColForWorkspace(c))
    .filter(Boolean);
}

function adaptDealsColForWorkspace(col) {
  if (typeof isPresaleWorkspace !== "function" || !isPresaleWorkspace()) return col;
  if (col.key === "stage") {
    const src = DEALS_TABLE_COLS.find(c => c.key === "presaleStage");
    return src ? { ...src, key: "stage", label: "Стадия" } : col;
  }
  if (col.key === "owner") {
    const src = DEALS_TABLE_COLS.find(c => c.key === "presaleOwner");
    return src ? { ...src, key: "owner", label: "Владелец" } : col;
  }
  if (col.key === "presaleStage" || col.key === "presaleOwner") return null;
  return col;
}

function getDealsTableColByKey(key) {
  const col = DEALS_TABLE_COLS.find(c => c.key === key);
  if (!col) return null;
  return adaptDealsColForWorkspace(col) || col;
}

function matchColFilter(col, d) {
  if (col.filter === "range") return matchRangeFilter(col, d);
  if (col.filter === "multiselect") {
    const selected = getMultiselectFilter(col.key);
    if (!selected.length) return true;
    if (typeof col.matchFilter === "function") return col.matchFilter(d, selected);
    return selected.includes(dealCellText(col, d));
  }
  const f = (dealsTableColFilters[col.key] || "").trim();
  if (!f) return true;
  if (col.filter === "select" || col.filter === "select-dynamic") {
    return dealCellText(col, d) === f;
  }
  return dealCellText(col, d).toLowerCase().includes(f.toLowerCase());
}

function getActiveDealsReportSpec() {
  return (typeof window !== "undefined" && window.dealsTableActiveSpec)
    || (typeof dealsTableActiveSpec !== "undefined" ? dealsTableActiveSpec : null);
}

function applyDealsTableFilters(deals) {
  let rows = deals || [];
  const activeSpec = getActiveDealsReportSpec();
  if (activeSpec && typeof filterDealsForReportSpec === "function") {
    rows = filterDealsForReportSpec(rows, activeSpec);
  } else {
    if (typeof applyPresetFilter === "function" && dealsTablePreset) {
      rows = applyPresetFilter(rows, dealsTablePreset);
    }
    if (typeof dealsReportSpecFilters !== "undefined" && dealsReportSpecFilters
      && typeof dealMatchesAmoFilters === "function") {
      const cols = typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : [];
      const scoringOpts = dealsTableScoringMode ? { mode: dealsTableScoringMode } : (
        typeof getDealsScoringOpts === "function" ? getDealsScoringOpts() : null
      );
      rows = rows.filter(d => dealMatchesAmoFilters(d, dealsReportSpecFilters, cols, scoringOpts));
    }
  }
  if (state?.dealsServerFiltered) return rows;
  const skipSystemExcludes = DYNAMICS_DRILL_PRESETS.has(dealsTablePreset?.type)
    || PRESALE_DRILL_PRESETS.has(dealsTablePreset?.type);
  if (!skipSystemExcludes) {
    if (typeof isPresaleWorkspace === "function" && isPresaleWorkspace()) {
      if (!presaleRejectFilterActive()) {
        rows = rows.filter(d => {
          const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : "";
          return st !== "Отказ";
        });
      }
    } else {
      rows = typeof applyDefaultExcludeRejected === "function"
        ? applyDefaultExcludeRejected(rows, getMultiselectFilter("stage"))
        : rows.filter(d => d.stage !== "Отказ");
      rows = typeof applyDefaultExcludeSuccess === "function"
        ? applyDefaultExcludeSuccess(rows, getMultiselectFilter("stage"))
        : rows;
    }
    if (typeof applyDefaultExcludeAdminOwners === "function") {
      rows = applyDefaultExcludeAdminOwners(rows, getMultiselectFilter("owner"));
    }
  }
  const colsToFilter = getVisibleDealsCols();
  const activeKeys = new Set(colsToFilter.map(c => c.key));
  for (const col of DEALS_TABLE_COLS) {
    if (activeKeys.has(col.key)) continue;
    if (col.filter === "multiselect" && getMultiselectFilter(col.key).length) colsToFilter.push(col);
    else if (col.filter === "range" && (dealsTableColFilters[col.key + "__from"] || dealsTableColFilters[col.key + "__to"])) colsToFilter.push(col);
    else if (dealsTableColFilters[col.key]) colsToFilter.push(col);
  }
  for (const col of colsToFilter) {
    if (col.filter === "range") {
      if (dealsTableColFilters[col.key + "__from"] || dealsTableColFilters[col.key + "__to"]) {
        rows = rows.filter(d => matchRangeFilter(col, d));
      }
      continue;
    }
    if (col.filter === "multiselect") {
      if (getMultiselectFilter(col.key).length) {
        rows = rows.filter(d => matchColFilter(col, d));
      }
      continue;
    }
    const f = dealsTableColFilters[col.key];
    if (f) rows = rows.filter(d => matchColFilter(col, d));
  }
  const search = (dealsTableSearch || "").trim().toLowerCase();
  if (search) {
    rows = rows.filter(d => {
      const parts = [
        d.customer, d.id, d.owner, d.stage, d.industry, d.partner, d.pains,
        d.presale?.owner, d.presale?.stage, d.dealType,
        d.amoId != null ? `amo ${d.amoId}` : "",
        d.amoId != null ? String(d.amoId) : "",
        ...(getVisibleDealsCols().map(col => dealCellText(col, d))),
      ];
      const customer = String(d.customer || "");
      customer.split(/[()/,]/).forEach(t => { if (t.trim()) parts.push(t.trim()); });
      const hay = parts.join(" ").toLowerCase();
      return hay.includes(search);
    });
  }
  if (dealsMineOnly && typeof isDealMineForCurrentUser === "function") {
    rows = rows.filter(d => isDealMineForCurrentUser(d));
  } else if (dealsMineOnly && typeof isDealOwnedByCurrentUser === "function") {
    rows = rows.filter(d => isDealOwnedByCurrentUser(d));
  }
  return rows;
}

function sortDealsTableRows(deals) {
  const col = DEALS_TABLE_COLS.find(c => c.key === dealsTableSort.key) || DEALS_TABLE_COLS.find(c => c.key === "amount");
  const dir = dealsTableSort.dir === "asc" ? 1 : -1;
  return [...deals].sort((a, b) => {
    const av = colSortValue(col, a);
    const bv = colSortValue(col, b);
    if (col.num) {
      const an = av == null ? -Infinity : av;
      const bn = bv == null ? -Infinity : bv;
      return (an - bn) * dir;
    }
    return String(av).localeCompare(String(bv), "ru") * dir;
  });
}

function resolveFilterOptions(col, deals) {
  if (col.filter === "select-dynamic") {
    return [...new Set((deals || []).map(d => col.get(d)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  }
  if (typeof col.filterOptions === "function") return col.filterOptions();
  return col.filterOptions || [];
}

function renderMultiselectFilter(col, deals) {
  const options = typeof col.filterOptions === "function"
    ? col.filterOptions(deals)
    : resolveFilterOptions(col, deals);
  const selected = new Set(getMultiselectFilter(col.key));
  const label = selected.size === 0 ? "Все" : `${selected.size} выбр.`;
  const checkboxes = options.map(o =>
    `<label class="deals-ms-opt">
      <input type="checkbox" class="deals-ms-cb" data-col="${col.key}" value="${escapeHtml(o)}"${selected.has(o) ? " checked" : ""}>
      <span>${escapeHtml(o)}</span>
    </label>`
  ).join("");
  return `<div class="deals-ms-filter${col.msAlign === "right" ? " deals-ms-filter--right" : ""}" data-col="${col.key}">
    <button type="button" class="deals-ms-toggle" data-col="${col.key}">${escapeHtml(label)} ▾</button>
    <div class="deals-ms-panel">
      <div class="deals-ms-actions">
        <button type="button" class="deals-ms-all" data-col="${col.key}">Выбрать все</button>
        <button type="button" class="deals-ms-clear" data-col="${col.key}">Сбросить</button>
      </div>
      <div class="deals-ms-list">${checkboxes}</div>
    </div>
  </div>`;
}

function renderColFilter(col, deals) {
  if (!col.filter) return "";
  if (col.filter === "multiselect") return renderMultiselectFilter(col, deals);
  if (col.filter === "range") {
    const from = escapeHtml(dealsTableColFilters[col.key + "__from"] || "");
    const to = escapeHtml(dealsTableColFilters[col.key + "__to"] || "");
    const suffix = col.key === "manualProb" ? "%" : (col.key === "amount" ? " ₽" : "");
    return `<div class="range-filter">
      <input type="number" class="deals-col-filter deals-range-input" data-col="${col.key}" data-bound="from" placeholder="от${suffix ? "" : ""}" value="${from}" title="От">
      <input type="number" class="deals-col-filter deals-range-input" data-col="${col.key}" data-bound="to" placeholder="до" value="${to}" title="До">
    </div>`;
  }
  if (col.filter === "select" || col.filter === "select-dynamic") {
    const options = resolveFilterOptions(col, deals);
    const opts = options.map(o =>
      `<option value="${escapeHtml(o)}" ${dealsTableColFilters[col.key] === o ? "selected" : ""}>${escapeHtml(o)}</option>`
    ).join("");
    return `<select class="deals-col-filter" data-col="${col.key}"><option value="">Все</option>${opts}</select>`;
  }
  const val = escapeHtml(dealsTableColFilters[col.key] || "");
  return `<input type="search" class="deals-col-filter" data-col="${col.key}" placeholder="Фильтр…" value="${val}">`;
}

function renderDealsTableRow(d) {
  const realIdx = state.deals.findIndex(x => x.id === d.id);
  const canDel = typeof canDeleteDeal === "function" ? canDeleteDeal(d) : true;
  const viewTitle = typeof canEditDeal === "function" && !canEditDeal(d) ? "Просмотр паспорта" : "Редактировать";
  const admin = typeof isAdmin === "function" ? isAdmin() : false;
  return `<tr class="deals-row-clickable" data-id="${escapeHtml(d.id)}" title="Открыть паспорт сделки">
    ${admin ? `<td class="col-bulk" onclick="event.stopPropagation()"><input type="checkbox" class="deal-bulk-cb" value="${escapeHtml(d.id)}"></td>` : ""}
    ${getVisibleDealsCols().map(c => c.render(d)).join("")}
    <td class="actions">
      <button type="button" class="btn btn-sm" onclick="event.stopPropagation(); openDealById('${escapeHtml(d.id)}')" title="${viewTitle}">✏️</button>
      ${canDel ? `<button type="button" class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteDeal(${realIdx})" title="${admin ? "Удалить / архивировать" : "В архив"}">🗑</button>` : ""}
    </td>
  </tr>`;
}

function sortMarkHtml(key) {
  const active = dealsTableSort.key === key;
  const icon = active ? (dealsTableSort.dir === "asc" ? "▲" : "▼") : "⇅";
  return `<span class="sort-mark${active ? " active" : ""}">${icon}</span>`;
}

function renderSortHeader(col) {
  const active = dealsTableSort.key === col.key;
  const title = col.headerTitle ? ` title="${escapeHtml(col.headerTitle)}"` : "";
  return `<th data-sort="${col.key}" class="sortable${active ? " sorted-" + dealsTableSort.dir : ""}"${title}>
    <span class="th-label">${escapeHtml(col.label)}</span>${sortMarkHtml(col.key)}
  </th>`;
}

function updateDealsTableSortMarks() {
  document.querySelectorAll("#deals-table th[data-sort]").forEach(el => {
    const key = el.dataset.sort;
    const col = DEALS_TABLE_COLS.find(c => c.key === key);
    const active = key === dealsTableSort.key;
    el.classList.toggle("sorted-asc", active && dealsTableSort.dir === "asc");
    el.classList.toggle("sorted-desc", active && dealsTableSort.dir === "desc");
    let label = el.querySelector(".th-label");
    if (!label) {
      label = document.createElement("span");
      label.className = "th-label";
      el.prepend(label);
    }
    label.textContent = col?.label || key;
    const mark = el.querySelector(".sort-mark");
    const markHtml = sortMarkHtml(key);
    if (mark) {
      const tmp = document.createElement("span");
      tmp.innerHTML = markHtml;
      mark.replaceWith(tmp.firstChild);
    } else {
      el.insertAdjacentHTML("beforeend", markHtml);
    }
  });
}

function updateDealsTableBody(deals) {
  const tbody = document.getElementById("deals-tbody");
  const meta = document.getElementById("deals-table-meta");
  if (!tbody) return;
  const filtered = sortDealsTableRows(applyDealsTableFilters(deals));
  tbody.innerHTML = filtered.map(renderDealsTableRow).join("");
  const total = state?.dealsPagination?.total ?? deals.length;
  const pg = state?.dealsPagination;
  if (meta) {
    let text = `Показано ${filtered.length} из ${total}`;
    if (pg && pg.totalPages > 1) text += ` · стр. ${pg.page}/${pg.totalPages}`;
    meta.textContent = text;
  }
}

function setColFilterFromInput(el) {
  const col = el.dataset.col;
  const bound = el.dataset.bound;
  if (bound) dealsTableColFilters[col + "__" + bound] = el.value;
  else dealsTableColFilters[col] = el.value;
  if (typeof dealsReportSpecFilters !== "undefined") dealsReportSpecFilters = null;
  if (typeof dealsTableActiveSpec !== "undefined") dealsTableActiveSpec = null;
  if (typeof window !== "undefined") window.dealsTableActiveSpec = null;
}

function updateMultiselectToggleLabel(colKey) {
  const wrap = document.querySelector(`.deals-ms-filter[data-col="${colKey}"]`);
  if (!wrap) return;
  const checked = wrap.querySelectorAll(".deals-ms-cb:checked");
  const btn = wrap.querySelector(".deals-ms-toggle");
  if (!btn) return;
  btn.textContent = (checked.length ? `${checked.length} выбр.` : "Все") + " ▾";
}

function syncMultiselectFilter(colKey) {
  const wrap = document.querySelector(`.deals-ms-filter[data-col="${colKey}"]`);
  if (!wrap) return;
  const checked = [...wrap.querySelectorAll(".deals-ms-cb:checked")].map(cb => cb.value);
  if (checked.length) dealsTableColFilters[colKey] = checked;
  else delete dealsTableColFilters[colKey];
  if (typeof dealsReportSpecFilters !== "undefined") dealsReportSpecFilters = null;
  if (typeof dealsTableActiveSpec !== "undefined") dealsTableActiveSpec = null;
  if (typeof window !== "undefined") window.dealsTableActiveSpec = null;
  updateMultiselectToggleLabel(colKey);
}

const DEALS_MS_PANEL_W = 280;

function resetDealsTableMultiselectPanel(wrap) {
  const panel = wrap?.querySelector(".deals-ms-panel");
  if (!panel) return;
  panel.classList.remove("deals-ms-panel--table-fixed");
  panel.style.position = "";
  panel.style.left = "";
  panel.style.top = "";
  panel.style.width = "";
  panel.style.zIndex = "";
  panel.style.maxHeight = "";
}

function positionDealsTableMultiselect(wrap) {
  const panel = wrap?.querySelector(".deals-ms-panel");
  const toggle = wrap?.querySelector(".deals-ms-toggle");
  if (!panel || !toggle || !wrap.closest("#deals-table")) return;

  panel.classList.add("deals-ms-panel--table-fixed");
  const rect = toggle.getBoundingClientRect();
  const isRight = wrap.classList.contains("deals-ms-filter--right");
  let left = isRight ? rect.right - DEALS_MS_PANEL_W : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - DEALS_MS_PANEL_W - 8));

  const maxH = Math.min(280, window.innerHeight - 16);
  let top = rect.bottom + 2;
  if (top + maxH > window.innerHeight - 8 && rect.top - 2 - maxH >= 8) {
    top = rect.top - 2 - maxH;
  }

  panel.style.position = "fixed";
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.width = `${DEALS_MS_PANEL_W}px`;
  panel.style.zIndex = "500";
  panel.style.maxHeight = `${maxH}px`;
}

function closeAllMultiselectPanels(except) {
  document.querySelectorAll(".deals-ms-filter.open").forEach(el => {
    if (except && el === except) return;
    el.classList.remove("open");
    resetDealsTableMultiselectPanel(el);
  });
}

function repositionOpenDealsTableMultiselect() {
  const open = document.querySelector("#deals-table .deals-ms-filter.open");
  if (open) positionDealsTableMultiselect(open);
}

function clearAllDealsFilters() {
  dealsTableColFilters = {};
  dealsTablePreset = null;
  dealsTableSearch = "";
  dealsReportSpecFilters = null;
  dealsTableActiveSpec = null;
  if (typeof window !== "undefined") window.dealsTableActiveSpec = null;
  dealsMineOnly = false;
  localStorage.setItem("itmen_deals_mine", "0");
  if (typeof closeDealsFilterPop === "function") closeDealsFilterPop();
  const gs = document.getElementById("deals-global-search");
  if (gs) gs.value = "";
  const mineCb = document.getElementById("deals-mine-only");
  if (mineCb) mineCb.checked = false;
  document.querySelectorAll(".deals-col-filter").forEach(el => { el.value = ""; });
  document.querySelectorAll(".deals-ms-cb").forEach(el => { el.checked = false; });
  document.querySelectorAll(".deals-ms-toggle").forEach(el => { el.textContent = "Все ▾"; });
  closeAllMultiselectPanels();
}

function renderDealsColumnsGroup(group) {
  const cols = group.keys.map(k => DEALS_TABLE_COLS.find(c => c.key === k)).filter(Boolean);
  if (!cols.length) return "";
  return `<section class="deals-col-group">
    <div class="deals-col-group-head">
      <h4 class="deals-col-group-title">${escapeHtml(group.label)}</h4>
      <button type="button" class="btn btn-sm deals-col-group-toggle" data-group="${group.id}">Все</button>
    </div>
    <div class="deals-col-group-list">
      ${cols.map(c => `<label class="deals-col-opt">
        <input type="checkbox" class="deals-col-cb" value="${c.key}" data-group="${group.id}"${dealsVisibleColKeys.includes(c.key) ? " checked" : ""}>
        <span class="deals-col-label">${escapeHtml(c.label)}</span>
      </label>`).join("")}
    </div>
  </section>`;
}

function openDealsColumnsModal() {
  let modal = document.getElementById("deals-columns-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "deals-columns-modal";
    modal.className = "modal-overlay deals-columns-overlay";
    document.body.appendChild(modal);
    modal.addEventListener("click", e => {
      if (e.target === modal) closeDealsColumnsModal();
    });
  }
  const selectedCount = dealsVisibleColKeys.length;
  modal.innerHTML = `
    <div class="modal deals-columns-modal" role="dialog" aria-labelledby="deals-columns-title">
      <div class="modal-header">
        <div>
          <h3 id="deals-columns-title">Колонки таблицы</h3>
          <p class="muted deals-columns-sub">Выбрано: ${selectedCount} · только в вашем браузере</p>
        </div>
        <button type="button" class="btn btn-sm" onclick="closeDealsColumnsModal()" aria-label="Закрыть">✕</button>
      </div>
      <div class="deals-columns-toolbar">
        <button type="button" class="btn btn-sm" id="deals-cols-all">Выбрать все</button>
        <button type="button" class="btn btn-sm" id="deals-cols-none">Снять все</button>
      </div>
      <div class="modal-body deals-columns-body">
        ${DEALS_COL_GROUPS.map(renderDealsColumnsGroup).join("")}
      </div>
      <div class="deals-columns-footer">
        <button type="button" class="btn btn-sm" id="deals-cols-reset">По умолчанию</button>
        <button type="button" class="btn btn-primary btn-sm" id="deals-cols-apply">Применить</button>
      </div>
    </div>`;
  modal.classList.add("open");

  const syncCount = () => {
    const n = modal.querySelectorAll(".deals-col-cb:checked").length;
    const sub = modal.querySelector(".deals-columns-sub");
    if (sub) sub.textContent = `Выбрано: ${n} · только в вашем браузере`;
  };

  modal.querySelectorAll(".deals-col-cb").forEach(cb => {
    cb.addEventListener("change", syncCount);
  });

  modal.querySelector("#deals-cols-all")?.addEventListener("click", () => {
    modal.querySelectorAll(".deals-col-cb").forEach(cb => { cb.checked = true; });
    syncCount();
  });
  modal.querySelector("#deals-cols-none")?.addEventListener("click", () => {
    modal.querySelectorAll(".deals-col-cb").forEach(cb => { cb.checked = false; });
    syncCount();
  });
  modal.querySelectorAll(".deals-col-group-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const gid = btn.dataset.group;
      const boxes = modal.querySelectorAll(`.deals-col-cb[data-group="${gid}"]`);
      const allOn = [...boxes].every(cb => cb.checked);
      boxes.forEach(cb => { cb.checked = !allOn; });
      btn.textContent = allOn ? "Все" : "Снять";
      syncCount();
    });
  });
  modal.querySelector("#deals-cols-reset")?.addEventListener("click", () => {
    dealsVisibleColKeys = [...DEALS_DEFAULT_VISIBLE_COLS];
    openDealsColumnsModal();
  });
  modal.querySelector("#deals-cols-apply")?.addEventListener("click", applyDealsColumnsSelection);
}

function closeDealsColumnsModal() {
  document.getElementById("deals-columns-modal")?.classList.remove("open");
}

function applyDealsColumnsSelection() {
  const modal = document.getElementById("deals-columns-modal");
  const checkedSet = new Set([...(modal?.querySelectorAll(".deals-col-cb:checked") || [])].map(cb => cb.value));
  if (!checkedSet.size) {
    alert("Должна остаться хотя бы одна колонка");
    return;
  }
  const ordered = DEALS_COL_GROUPS.flatMap(g => g.keys).filter(k => checkedSet.has(k));
  dealsVisibleColKeys = ordered.length ? ordered : [...checkedSet];
  persistDealsVisibleCols();
  closeDealsColumnsModal();
  if (!dealsVisibleColKeys.includes(dealsTableSort.key)) {
    dealsTableSort = { key: dealsVisibleColKeys[0] || "amount", dir: "desc" };
  }
  renderDealsTable(getEnrichedDeals());
}

function closeDealsFilterPop() {
  dealsFilterOpen = false;
  const pop = document.getElementById("deals-filter-pop");
  if (pop) pop.hidden = true;
  if (typeof unregisterAmoFilterPop === "function") unregisterAmoFilterPop();
}

function openDealsFilterPop(btn) {
  const pop = document.getElementById("deals-filter-pop");
  if (!pop) return;
  pop.hidden = false;
  mountAmoFilterPanel(pop, {
    filters: dealsTableColFilters,
    deals: getEnrichedDeals(),
    onApply: f => {
      dealsTableColFilters = { ...f };
      if (typeof dealsReportSpecFilters !== "undefined") dealsReportSpecFilters = null;
      if (typeof dealsTableActiveSpec !== "undefined") dealsTableActiveSpec = null;
      if (typeof window !== "undefined") window.dealsTableActiveSpec = null;
      closeDealsFilterPop();
      dealsTablePreset = null;
      onDealsFilterChanged(1);
      return;
    },
    onReset: () => { dealsTableColFilters = {}; },
    onClose: () => closeDealsFilterPop(),
  });
  if (typeof registerAmoFilterPop === "function") {
    registerAmoFilterPop(pop, btn?.closest(".amo-filter-anchor") || btn, closeDealsFilterPop);
  }
}

function bindDealsTableEvents() {
  dealsTableBound = true;
  const page = document.getElementById("page-deals");
  if (!page) return;

  page.addEventListener("change", e => {
    if (e.target.id === "deals-bulk-all") {
      document.querySelectorAll(".deal-bulk-cb").forEach(cb => { cb.checked = e.target.checked; });
    }
  });

  page.addEventListener("click", e => {
    const msToggle = e.target.closest(".deals-ms-toggle:not(.dash-ms-toggle)");
    if (msToggle) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = msToggle.closest(".deals-ms-filter");
      if (!wrap) return;
      const opening = !wrap.classList.contains("open");
      closeAllMultiselectPanels(opening ? wrap : null);
      wrap.classList.toggle("open", opening);
      if (opening) positionDealsTableMultiselect(wrap);
      else resetDealsTableMultiselectPanel(wrap);
      return;
    }
    const msClear = e.target.closest(".deals-ms-clear:not(.dash-ms-clear)");
    if (msClear) {
      e.preventDefault();
      e.stopPropagation();
      const colKey = msClear.dataset.col;
      const wrap = msClear.closest(".deals-ms-filter");
      wrap?.querySelectorAll(".deals-ms-cb").forEach(cb => { cb.checked = false; });
      delete dealsTableColFilters[colKey];
      updateMultiselectToggleLabel(colKey);
      onDealsFilterChanged(1);
      return;
    }
    const msAll = e.target.closest(".deals-ms-all:not(.dash-ms-all)");
    if (msAll) {
      e.preventDefault();
      e.stopPropagation();
      const colKey = msAll.dataset.col;
      const wrap = msAll.closest(".deals-ms-filter");
      wrap?.querySelectorAll(".deals-ms-cb").forEach(cb => { cb.checked = true; });
      syncMultiselectFilter(colKey);
      onDealsFilterChanged(1);
      return;
    }
    if (e.target.closest(".deals-ms-opt") && e.target.closest("#deals-table")) {
      e.stopPropagation();
      return;
    }
    if (!e.target.closest(".deals-ms-filter")) closeAllMultiselectPanels();

    const th = e.target.closest("th[data-sort]");
    if (th && !e.target.closest(".deals-filter-row")) {
      e.preventDefault();
      const key = th.dataset.sort;
      if (dealsTableSort.key === key) {
        dealsTableSort.dir = dealsTableSort.dir === "asc" ? "desc" : "asc";
      } else {
        dealsTableSort = { key, dir: (DEALS_TABLE_COLS.find(c => c.key === key)?.num ? "desc" : "asc") };
      }
      updateDealsTableSortMarks();
      if (window.ITMEN_API?.backend === "pocketbase" && hasDealsListServerQuery(buildDealsListQueryParams())) {
        reloadDealsFromServer(state?.dealsPagination?.page || 1);
      } else {
        updateDealsTableBody(getEnrichedDeals());
      }
      return;
    }

    if (e.target.id === "deals-clear-filters") {
      clearAllDealsFilters();
      if (typeof updateDealsReportHash === "function") {
        updateDealsReportHash(buildDealsReportSpec({}, null));
      }
      onDealsFilterChanged(1);
      return;
    }
    if (e.target.id === "deals-reload-server") {
      if (typeof forceReloadFromServer === "function") forceReloadFromServer();
      return;
    }
    if (e.target.id === "deals-copy-link") {
      copyDealsReportLink();
      return;
    }
    if (e.target.id === "deals-columns-btn") {
      openDealsColumnsModal();
      return;
    }
    if (e.target.id === "deals-export-excel") {
      if (typeof exportDealsToExcel === "function") exportDealsToExcel();
      else alert("Модуль экспорта не загружен");
      return;
    }
    const row = e.target.closest("#deals-tbody tr.deals-row-clickable");
    if (row && !e.target.closest(".actions") && !e.target.closest("button") && !e.target.closest("a.deal-page-link")) {
      if (row.classList.contains("deals-row-loading")) return;
      const realIdx = state.deals.findIndex(x => x.id === row.dataset.id);
      if (realIdx >= 0) {
        const dealId = state.deals[realIdx]?.id;
        if (dealId && typeof openDealPage === "function") openDealPage(dealId, "deals");
        else openDealModal(realIdx);
      }
    }
  });

  page.addEventListener("input", e => {
    if (e.target.id === "deals-global-search") {
      dealsTableSearch = e.target.value;
      onDealsFilterChanged(1);
      return;
    }
    if (e.target.classList.contains("deals-col-filter")) {
      setColFilterFromInput(e.target);
      dealsTablePreset = null;
      onDealsFilterChanged(1);
    }
  });

  page.addEventListener("change", e => {
    if (e.target.id === "deals-mine-only") {
      dealsMineOnly = e.target.checked;
      localStorage.setItem("itmen_deals_mine", dealsMineOnly ? "1" : "0");
      onDealsFilterChanged(1);
      return;
    }
    if (e.target.classList.contains("deals-ms-cb") && e.target.dataset.col) {
      syncMultiselectFilter(e.target.dataset.col);
      dealsTablePreset = null;
      onDealsFilterChanged(1);
      return;
    }
    if (e.target.classList.contains("deals-col-filter") && e.target.tagName === "SELECT") {
      setColFilterFromInput(e.target);
      dealsTablePreset = null;
      onDealsFilterChanged(1);
    }
  });

  if (!page.dataset.msScrollBound) {
    page.dataset.msScrollBound = "1";
    window.addEventListener("scroll", repositionOpenDealsTableMultiselect, true);
    window.addEventListener("resize", () => {
      syncDealsTableHeadHeight();
      repositionOpenDealsTableMultiselect();
    });
  }
}

function syncDealsTableHeadHeight() {
  const head = document.querySelector("#deals-table thead tr:first-child");
  if (!head) return;
  const h = head.getBoundingClientRect().height;
  if (h > 0) document.documentElement.style.setProperty("--deals-head-h", `${h}px`);
}

function getSelectedDealIds() {
  return [...document.querySelectorAll(".deal-bulk-cb:checked")].map(cb => cb.value);
}

window.getSelectedDealIds = getSelectedDealIds;

function syncDealsReportHashFromTable() {
  if (typeof updateDealsReportHash !== "function") return;
  const spec = typeof buildDealsReportSpecFromTable === "function"
    ? buildDealsReportSpecFromTable()
    : buildDealsReportSpec(dealsTableColFilters, dealsTablePreset);
  updateDealsReportHash(spec);
}

function renderDealsFilterBanner() {
  const el = document.getElementById("deals-filter-banner");
  if (!el || typeof getDealsReportFilterSummary !== "function") return;
  const parts = getDealsReportFilterSummary();
  if (!parts.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `<span class="deals-filter-banner-label">Активный срез:</span> ${parts.map(p => `<span class="deals-filter-tag">${escapeHtml(p)}</span>`).join(" ")}`;
}

function renderDealsTable(deals) {
  const el = document.getElementById("page-deals");
  if (!el) return;
  const admin = typeof isAdmin === "function" ? isAdmin() : true;
  const filterN = typeof amoFilterActiveCount === "function"
    ? amoFilterActiveCount(dealsTableColFilters, DEALS_TABLE_COLS)
    : 0;
  el.innerHTML = `
    <div class="deals-toolbar">
      <button class="btn btn-primary" onclick="openNewDealPage('deals')">+ Добавить</button>
      ${admin ? `<label class="btn" style="cursor:pointer">⬆️ Excel<input type="file" id="btn-import-excel" accept=".xlsx,.xls" hidden></label>` : ""}
      <input type="search" id="deals-global-search" class="deals-global-search" placeholder="Быстрый поиск…" value="${escapeHtml(dealsTableSearch)}">
      <label class="dash-mine-toggle muted deals-mine-toggle"><input type="checkbox" id="deals-mine-only" ${dealsMineOnly ? "checked" : ""}> Только мои</label>
      <div class="amo-filter-anchor">
        <button type="button" class="btn btn-sm${dealsFilterOpen ? " btn-primary" : ""}" id="deals-filters-btn">🔍 Фильтры${filterN ? ` (${filterN})` : ""}</button>
        <div class="amo-filter-pop" id="deals-filter-pop" ${dealsFilterOpen ? "" : "hidden"}></div>
      </div>
      <button type="button" class="btn btn-sm" id="deals-clear-filters">Сбросить</button>
      <button type="button" class="btn btn-sm" id="deals-columns-btn" title="Настроить видимые колонки">⚙ Колонки</button>
      <button type="button" class="btn btn-sm" id="deals-export-excel" title="Экспорт текущего среза в Excel">⬇️ Excel</button>
      ${admin ? `<button type="button" class="btn btn-sm" id="deals-reload-server" title="Сбросить кэш и загрузить все сделки с сервера">⟳ С сервера</button>` : ""}
      <button type="button" class="btn btn-sm" id="deals-copy-link" title="Скопировать ссылку с фильтрами">🔗 Поделиться</button>
      <span class="deals-table-meta" id="deals-table-meta"></span>
    </div>
    <div class="deals-filter-banner" id="deals-filter-banner" hidden></div>
    <p class="deals-table-hint muted">Балл (0–100): взвешенная сумма 9 критериев скоринга в паспорте (шкала 0–5 у каждого), формула (Σ оценка×вес) / 5 × 100. Категория: ≥80 горячая, ≥60 тёплая, ≥40 наблюдение, &lt;40 отказ.</p>
    <div class="deals-table-shell">
      <table class="deals-table deals-table-compact" id="deals-table">
        <thead>
          <tr>${admin ? "<th class=\"col-bulk\"><input type=\"checkbox\" id=\"deals-bulk-all\" title=\"Выбрать все\"></th>" : ""}${getVisibleDealsCols().map(c => renderSortHeader(c)).join("")}<th class="col-actions"></th></tr>
          <tr class="deals-filter-row deals-filter-row-hidden">${admin ? "<th></th>" : ""}${getVisibleDealsCols().map(c =>
            `<th>${renderColFilter(c, deals)}</th>`
          ).join("")}<th></th></tr>
        </thead>
        <tbody id="deals-tbody"></tbody>
      </table>
    </div>
    <div class="deals-pagination" id="deals-pagination" hidden></div>`;

  document.getElementById("btn-import-excel")?.addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) importExcelFile(f);
    e.target.value = "";
  });

  document.getElementById("deals-filters-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    const btn = e.target;
    if (dealsFilterOpen) {
      closeDealsFilterPop();
    } else {
      dealsFilterOpen = true;
      openDealsFilterPop(btn);
    }
  });

  bindDealsTableEvents();
  if (typeof syncDealsReportFiltersToUI === "function") syncDealsReportFiltersToUI();
  updateDealsTableBody(deals);
  renderDealsFilterBanner();
  renderDealsPagination();
  requestAnimationFrame(() => {
    syncDealsTableHeadHeight();
    const tbl = document.getElementById("deals-table");
    if (tbl) {
      delete tbl.dataset.resizeBound;
      if (typeof initTableColumnResize === "function") initTableColumnResize(tbl, "itmen_deals_col_widths");
    }
  });
}

window.ITMEN_AVATARS = {};

function normalizeAvatarOwnerKey(name) {
  return String(name || "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .toLowerCase();
}

async function loadManagerAvatars() {
  if (window.ITMEN_API?.backend !== "pocketbase") return;
  if (typeof apiLoadAvatarsResolved !== "function") return;
  try {
    window.ITMEN_AVATARS = await apiLoadAvatarsResolved();
  } catch (e) {
    console.warn("avatars:", e);
  }
}

function ownerAvatarHtml(name) {
  const avatars = window.ITMEN_AVATARS || {};
  const raw = String(name || "").trim();
  const url = avatars[raw] || avatars[normalizeAvatarOwnerKey(raw)];
  if (!url) return `<span class="owner-avatar owner-avatar-ph" aria-hidden="true"></span>`;
  return `<img src="${escapeHtml(url)}" class="owner-avatar" alt="" loading="lazy">`;
}

window.loadManagerAvatars = loadManagerAvatars;
window.ownerAvatarHtml = ownerAvatarHtml;

function getKanbanFilterCols() {
  return DEALS_TABLE_COLS;
}

function getDistinctDealColValues(col, deals) {
  const rows = (deals || []).map(d => (typeof enrichDeal === "function" ? enrichDeal(d) : d));
  if (typeof col.filterOptions === "function") {
    return col.filterOptions(rows);
  }
  const vals = new Set();
  rows.forEach(d => {
    const t = dealCellText(col, d);
    vals.add(t || "—");
  });
  return [...vals].sort((a, b) => String(a).localeCompare(String(b), "ru"));
}

function dealMatchesKanbanFilters(d, filters) {
  const enriched = typeof enrichDeal === "function" ? enrichDeal(d) : d;
  const q = (filters.q || "").trim().toLowerCase();
  if (q) {
    const hay = `${enriched.customer || ""} ${enriched.id || ""} ${enriched.owner || ""} ${enriched.presale?.owner || ""} ${enriched.presale?.stage || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const fields = filters.fields || {};
  for (const [key, selected] of Object.entries(fields)) {
    if (!selected?.length) continue;
    const col = DEALS_TABLE_COLS.find(c => c.key === key);
    if (!col) continue;
    const text = dealCellText(col, enriched) || "—";
    if (!selected.includes(text)) return false;
  }
  return true;
}

function buildDealsListQueryParams() {
  const filters = dealsTableColFilters || {};
  const hasFilters = Object.keys(filters).some(k => {
    const v = filters[k];
    return Array.isArray(v) ? v.length > 0 : String(v || "").trim() !== "";
  });
  return {
    q: (dealsTableSearch || "").trim() || undefined,
    mine: dealsMineOnly ? "1" : undefined,
    filters: hasFilters ? JSON.stringify(filters) : undefined,
    sortKey: dealsTableSort?.key,
    sortDir: dealsTableSort?.dir,
    presaleWs: typeof isPresaleWorkspace === "function" && isPresaleWorkspace() ? "1" : undefined,
    adminOwners: state?.adminOwners?.length ? JSON.stringify(state.adminOwners) : undefined,
  };
}

function hasDealsListServerQuery(lq) {
  if (!lq) return false;
  if (lq.q) return true;
  if (lq.mine) return true;
  if (lq.filters) return true;
  return false;
}

async function reloadDealsFromServer(page) {
  if (window.ITMEN_API?.backend !== "pocketbase") {
    updateDealsTableBody(getEnrichedDeals());
    renderDealsPagination();
    return;
  }
  const pg = state?.dealsPagination || { perPage: 100, page: 1 };
  const target = page || pg.page || 1;
  const listQuery = buildDealsListQueryParams();
  const useServerFilter = hasDealsListServerQuery(listQuery);
  const meta = document.getElementById("deals-table-meta");
  if (meta) meta.textContent = "Загрузка…";
  try {
    const loaded = await apiLoadPipeline({
      lite: true,
      page: target,
      perPage: pg.perPage || 100,
      listQuery: useServerFilter ? listQuery : undefined,
    });
    if (!loaded) return;
    state.deals = loaded.deals;
    state.dealsPagination = loaded.dealsPagination;
    state.dealsListQuery = loaded.dealsListQuery;
    state.dealsServerFiltered = !!loaded.dealsServerFiltered;
    state._allDealsLoaded = false;
    if (!useServerFilter) delete state.dealsListQuery;
    if (typeof persistStateCache === "function") persistStateCache(state);
    try { localStorage.setItem("itmen_pipeline", JSON.stringify(state)); } catch (_) {}
    updateDealsTableBody(getEnrichedDeals());
    renderDealsPagination();
    if (typeof updateDealCountBadge === "function") updateDealCountBadge();
  } catch (e) {
    if (typeof showToast === "function") showToast(e.message || "Ошибка загрузки");
  }
}

function onDealsFilterChanged(page) {
  if (window.ITMEN_API?.backend === "pocketbase") {
    if (hasDealsListServerQuery(buildDealsListQueryParams()) || state?.dealsServerFiltered) {
      scheduleDealsServerReload(page || 1);
      if (typeof syncDealsReportHashFromTable === "function") syncDealsReportHashFromTable();
      if (typeof renderDealsFilterBanner === "function") renderDealsFilterBanner();
      return;
    }
  }
  state.dealsServerFiltered = false;
  updateDealsTableBody(getEnrichedDeals());
  renderDealsPagination();
  if (typeof syncDealsReportHashFromTable === "function") syncDealsReportHashFromTable();
  if (typeof renderDealsFilterBanner === "function") renderDealsFilterBanner();
}

function scheduleDealsServerReload(page) {
  clearTimeout(window._dealsReloadTimer);
  window._dealsReloadTimer = setTimeout(() => reloadDealsFromServer(page || 1), 280);
}

function renderDealsPagination() {
  const el = document.getElementById("deals-pagination");
  if (!el) return;
  const pg = state?.dealsPagination;
  if (!pg || pg.totalPages <= 1) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const from = Math.max(1, pg.page - 2);
  const to = Math.min(pg.totalPages, pg.page + 2);
  const pages = [];
  for (let p = from; p <= to; p++) pages.push(p);
  el.innerHTML = `
    <button type="button" class="btn btn-sm" data-deals-page="prev" ${pg.page <= 1 ? "disabled" : ""}>←</button>
    ${pages.map(p => `<button type="button" class="btn btn-sm${p === pg.page ? " btn-primary" : ""}" data-deals-page="${p}">${p}</button>`).join(" ")}
    <button type="button" class="btn btn-sm" data-deals-page="next" ${pg.page >= pg.totalPages ? "disabled" : ""}>→</button>
    <span class="muted deals-pagination-info">${pg.page} / ${pg.totalPages} · всего ${pg.total}</span>`;
  el.querySelectorAll("[data-deals-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.dealsPage;
      if (v === "prev") loadDealsPage(pg.page - 1);
      else if (v === "next") loadDealsPage(pg.page + 1);
      else loadDealsPage(Number(v));
    });
  });
}

async function loadDealsPage(page) {
  if (hasDealsListServerQuery(buildDealsListQueryParams())) {
    return reloadDealsFromServer(page);
  }
  const pg = state?.dealsPagination || { perPage: 100, totalPages: 1 };
  const target = Math.max(1, Math.min(page, pg.totalPages || page));
  const meta = document.getElementById("deals-table-meta");
  if (meta) meta.textContent = "Загрузка…";
  try {
    const loaded = await apiLoadPipeline({ lite: true, page: target, perPage: pg.perPage || 100 });
    if (!loaded) return;
    state.deals = loaded.deals;
    state.dealsPagination = loaded.dealsPagination;
    state._allDealsLoaded = false;
    if (typeof persistStateCache === "function") persistStateCache(state);
    try { localStorage.setItem("itmen_pipeline", JSON.stringify(state)); } catch (_) {}
    updateDealsTableBody(typeof getEnrichedDeals === "function" ? getEnrichedDeals() : state.deals);
    renderDealsPagination();
    if (typeof updateDealCountBadge === "function") updateDealCountBadge();
    document.querySelector(".deals-table-shell")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    if (typeof showToast === "function") showToast(e.message || "Ошибка загрузки страницы");
  }
}

window.renderDealsPagination = renderDealsPagination;
window.loadDealsPage = loadDealsPage;
window.reloadDealsFromServer = reloadDealsFromServer;
window.buildDealsListQueryParams = buildDealsListQueryParams;
window.getKanbanFilterCols = getKanbanFilterCols;
window.getDistinctDealColValues = getDistinctDealColValues;
window.dealMatchesKanbanFilters = dealMatchesKanbanFilters;
