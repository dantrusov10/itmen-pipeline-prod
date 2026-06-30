/* Drill-down: дашборд → таблица сделок + шаринг фильтров в URL */
/* PILOT_STAGES — из calc.js */

/* var — общее состояние фильтров таблицы (report-filters грузится до deals-table.js) */
var dealsTableColFilters = {};
var dealsTableSearch = "";
var dealsTablePreset = null;
var dealsTableScoringMode = null;
var dealsReportSpecFilters = null;
var dealsTableActiveSpec = null;

function commitShortToLabel(short) {
  const c = (window.ITMEN_CONFIG?.commitStatuses || []).find(x => x.short === short);
  return c?.label || short;
}

function applyPresetFilter(rows, preset) {
  if (!preset?.type) return rows;
  switch (preset.type) {
    case "incomplete":
      return rows.filter(d => d.quality === "Неполный");
    case "passportBlocks": {
      const ids = preset.value ? String(preset.value).split("|").filter(Boolean) : (typeof passportBlockSelection !== "undefined" ? passportBlockSelection : []);
      return rows.filter(d => {
        const st = evaluatePassportBlocks(d);
        return !isPassportCompleteForBlocks(st, ids.length ? ids : PASSPORT_BLOCKS.map(b => b.id));
      });
    }
    case "passportBlock": {
      const blockId = preset.value;
      if (!blockId) return rows;
      return rows.filter(d => !evaluatePassportBlocks(d).blocks[blockId]);
    }
    case "riskTop": {
      const label = preset.value;
      if (!label) return rows.filter(d => d.riskFlag || (normalizeRiskTypes(d).length > 0));
      return rows.filter(d => {
        const types = normalizeRiskTypes(d);
        if (types.length && riskLabels(types).includes(label)) return true;
        const flag = String(d.riskFlag || "");
        if (flag === label) return true;
        return flag.split(";").map(s => s.trim()).includes(label);
      });
    }
    case "risk":
      return rows.filter(d => d.riskFlag);
    case "pilot":
      return rows.filter(d => PILOT_STAGES.includes(d.stage));
    case "attention":
      return rows.filter(d =>
        d.quality === "Неполный" ||
        (d.daysTo != null && d.daysTo < 0) ||
        (d.category === "Горячая" && d.budgetStatus === "Нет бюджета") ||
        d.riskFlag
      );
    case "hotNoBudget":
      return rows.filter(d => d.category === "Горячая" && d.budgetStatus === "Нет бюджета");
    case "overdue":
      return rows.filter(d => d.daysTo != null && d.daysTo < 0);
    case "overdue_tasks":
      return rows.filter(d => d.daysTo != null && d.daysTo < 0);
    case "no_tasks":
      return rows.filter(d => {
        const due = (typeof getDealTaskDue === "function" && getDealTaskDue(d.id)) || d.taskDue || "";
        return !String(due).trim();
      });
    case "segment": {
      const seg = preset.value;
      if (!seg) return rows;
      const labels = Object.fromEntries((window.ITMEN_CONFIG?.techSegments || []).map(s => [s.id, s.label]));
      return rows.filter(d => (d.techResearch?.seekingSegments || []).some(s => {
        const label = s === "other"
          ? (d.techResearch?.seekingOtherLabel?.trim() || "Другое")
          : (labels[s] || s);
        return label === seg;
      }));
    }
    case "competitor": {
      const key = preset.value;
      if (!key) return rows;
      return rows.filter(d => {
        const entries = typeof meaningfulCompetitorEntries === "function"
          ? meaningfulCompetitorEntries(d.techResearch)
          : Object.values(d.techResearch?.competitorEntries || {}).flat();
        return entries.some(e => typeof competitorEntryKey === "function" && competitorEntryKey(e) === key);
      });
    }
    case "hasCompetitors":
      return rows.filter(d => typeof dealHasCompetitors === "function"
        ? dealHasCompetitors(d)
        : Object.values(d.techResearch?.competitorEntries || {}).flat().some(e => e && (e.vendor || e.product)));
    case "strongCommits": {
      const strongIds = ["protocol", "loi", "guarantee", "contract"];
      return rows.filter(d => strongIds.includes(normalizeCommitStatus(d.commitStatus)));
    }
    case "confirmedBudget":
      return rows.filter(d => (d.budgetStatus || "") === "Подтверждён");
    case "dealIds": {
      const ids = preset.value ? String(preset.value).split("|").filter(Boolean) : [];
      if (!ids.length) return rows;
      const set = new Set(ids);
      return rows.filter(d => set.has(d.id));
    }
    case "presaleActive":
      return rows.filter(d => {
        const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "");
        return st === "Подготовка к пилоту" || st === "В процессе пилота";
      });
    case "presaleSuccess":
      return rows.filter(d => {
        const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "");
        return st === "Успех пилота" || Boolean(d.presale?.successWithoutPilot);
      });
    case "presaleFailed":
      return rows.filter(d => {
        const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "");
        return st === "Отказ";
      });
    case "presaleOverdue": {
      const now = Date.now();
      return rows.filter(d => {
        const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "");
        if (st !== "В процессе пилота") return false;
        const end = d.presale?.pilotEnd;
        if (!end) return false;
        const t = new Date(end).getTime();
        return !Number.isNaN(t) && t < now;
      });
    }
    case "presaleNoStage":
      return rows.filter(d => !(typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "").trim()));
    case "presalePipeline":
      return rows;
    case "pipelineDelta": {
      const ids = preset.value ? String(preset.value).split("|").filter(Boolean) : [];
      if (!ids.length) return [];
      const set = new Set(ids);
      return rows.filter(d => set.has(d.id));
    }
    case "weightedDelta":
    case "scoreDelta":
    case "dealCountDelta": {
      const ids = preset.value ? String(preset.value).split("|").filter(Boolean) : [];
      if (!ids.length) return [];
      const set = new Set(ids);
      return rows.filter(d => set.has(d.id));
    }
    default:
      return rows;
  }
}

var dealsTableScoringMode = null;

function getDealsScoringOpts() {
  return dealsTableScoringMode ? { mode: dealsTableScoringMode } : null;
}

function scoringModeLabel(mode) {
  if (mode === "prob_only") return "только вероятность менеджера";
  if (mode === "no_prob") return "без вероятности менеджера";
  if (mode === "with_prob") return "с вероятностью менеджера";
  return null;
}

function buildDealsReportSpec(filters = {}, preset = null, mineOnly, scoringMode, opts = {}) {
  const mine = mineOnly != null ? !!mineOnly : (typeof dealsMineOnly !== "undefined" ? !!dealsMineOnly : false);
  const f = { ...(filters || {}) };
  if (!opts.skipTableSearch && typeof dealsTableSearch !== "undefined" && dealsTableSearch.trim()) {
    f.q = dealsTableSearch.trim();
  }
  const mode = scoringMode != null ? scoringMode : (dealsTableScoringMode || null);
  return {
    filters: f,
    preset: preset ? { ...preset } : null,
    mineOnly: mine,
    scoringMode: mode || null,
  };
}

function buildDealsReportSpecFromTable() {
  const spec = buildDealsReportSpec(dealsTableColFilters, dealsTablePreset);
  if (dealsTableScoringMode) spec.scoringMode = dealsTableScoringMode;
  return spec;
}

function buildKanbanReportSpec(filters, mineOnly) {
  const f = filters != null ? filters : (typeof kanbanFilters !== "undefined" ? kanbanFilters : {});
  const mine = mineOnly != null ? !!mineOnly : (typeof kanbanMineOnly !== "undefined" ? !!kanbanMineOnly : false);
  return { filters: { ...f }, mineOnly: mine };
}

function parsePageFilterParams(params) {
  const filters = {};
  params.forEach((val, key) => {
    if (key === "preset" || key === "presetValue" || key === "mine" || key === "scoring") return;
    if (key.endsWith("__from") || key.endsWith("__to")) {
      filters[key] = val;
      return;
    }
    filters[key] = val.includes("|") ? val.split("|") : val;
  });
  return filters;
}

function serializePageFilterParams(filters, extra = {}) {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, val]) => {
    if (val == null || val === "") return;
    if (Array.isArray(val)) {
      if (val.length) params.set(key, val.join("|"));
    } else {
      params.set(key, String(val));
    }
  });
  if (extra.mineOnly) params.set("mine", "1");
  return params;
}

const WORKSPACE_HASH_IDS = new Set(["sales", "presale", "partners", "tech_partners"]);

function splitWorkspaceFromHash(raw) {
  raw = String(raw || "").replace(/^#/, "");
  const slash = raw.indexOf("/");
  if (slash <= 0) return { workspace: null, rest: raw };
  const maybeWs = raw.slice(0, slash);
  if (WORKSPACE_HASH_IDS.has(maybeWs)) {
    return { workspace: maybeWs, rest: raw.slice(slash + 1) };
  }
  return { workspace: null, rest: raw };
}

function getWorkspaceHashPrefix(workspaceId) {
  const ws = workspaceId
    || (typeof getActiveWorkspaceId === "function" ? getActiveWorkspaceId() : null)
    || "sales";
  return `${ws}/`;
}

function withWorkspaceHash(pagePath, workspaceId) {
  const path = String(pagePath || "").replace(/^\/+/, "");
  return getWorkspaceHashPrefix(workspaceId) + path;
}

function serializeDealsReportSpec(spec, workspaceId) {
  const params = serializePageFilterParams(spec?.filters || {}, { mineOnly: spec?.mineOnly });
  if (spec?.preset?.type) {
    params.set("preset", spec.preset.type);
    if (spec.preset.value) params.set("presetValue", spec.preset.value);
  }
  if (spec?.scoringMode) params.set("scoring", spec.scoringMode);
  const qs = params.toString();
  const path = qs ? `deals?${qs}` : "deals";
  return withWorkspaceHash(path, workspaceId);
}

function serializeKanbanSpec(spec, workspaceId) {
  const params = serializePageFilterParams(spec?.filters || {}, { mineOnly: spec?.mineOnly });
  const qs = params.toString();
  const path = qs ? `kanban?${qs}` : "kanban";
  return withWorkspaceHash(path, workspaceId);
}

function normalizePageId(page) {
  const p = String(page || "").replace(/^\/+/, "").trim();
  if (!p || p === "/") return "panel";
  if (p.startsWith("deals")) return "deals";
  if (p === "deal" || p.startsWith("deal/")) return "deal";
  if (PAGES && PAGES[p]) return p;
  if (p === "activities") return "activities";
  return "panel";
}

function parseHashRaw(raw) {
  const { workspace, rest } = splitWorkspaceFromHash(raw);
  raw = rest;
  if (!raw) return { workspace, page: "panel", spec: null, kanbanSpec: null, dealId: null };
  if (raw.startsWith("deal/")) {
    return {
      workspace,
      page: "deal",
      spec: null,
      kanbanSpec: null,
      dealId: decodeURIComponent(raw.slice(5)),
    };
  }
  const q = raw.indexOf("?");
  const pagePart = q >= 0 ? raw.slice(0, q) : raw;
  const query = q >= 0 ? raw.slice(q + 1) : "";
  const page = normalizePageId(pagePart);
  if (!query) {
    return {
      workspace,
      page,
      spec: page === "deals" ? null : undefined,
      kanbanSpec: page === "kanban" ? null : undefined,
      dealId: null,
    };
  }
  const params = new URLSearchParams(query);
  const mineOnly = params.get("mine") === "1";
  if (page === "deals") {
    const filters = parsePageFilterParams(params);
    const presetType = params.get("preset");
    const preset = presetType ? { type: presetType, value: params.get("presetValue") || undefined } : null;
    const scoringMode = params.get("scoring") || null;
    return {
      workspace,
      page,
      spec: buildDealsReportSpec(filters, preset, mineOnly, scoringMode),
      kanbanSpec: null,
      dealId: null,
    };
  }
  if (page === "kanban") {
    const filters = parsePageFilterParams(params);
    return {
      workspace,
      page,
      spec: null,
      kanbanSpec: buildKanbanReportSpec(filters, mineOnly),
      dealId: null,
    };
  }
  return { workspace, page, spec: null, kanbanSpec: null, dealId: null };
}

function parseLocationHash() {
  return parseHashRaw((location.hash || "").replace(/^#/, ""));
}

function applyDealsReportSpec(spec) {
  dealsTableColFilters = {};
  dealsTablePreset = null;
  dealsTableSearch = "";
  dealsTableScoringMode = null;
  dealsReportSpecFilters = null;
  dealsTableActiveSpec = null;
  if (typeof dealsMineOnly !== "undefined") dealsMineOnly = false;
  if (!spec) {
    if (typeof dealsMineOnly !== "undefined") {
      dealsMineOnly = localStorage.getItem("itmen_deals_mine") === "1";
    }
    return;
  }

  const filters = { ...(spec.filters || {}) };
  if (filters.q) {
    dealsTableSearch = String(filters.q);
    delete filters.q;
  }
  Object.entries(filters).forEach(([key, val]) => {
    if (Array.isArray(val)) {
      if (val.length) dealsTableColFilters[key] = val;
    } else if (val !== "" && val != null) {
      dealsTableColFilters[key] = val;
    }
  });
  dealsTablePreset = spec.preset?.type ? { ...spec.preset } : null;
  if (spec.filters && Object.keys(spec.filters).length) {
    dealsReportSpecFilters = { ...spec.filters };
  }
  dealsTableActiveSpec = {
    filters: { ...(spec.filters || {}) },
    preset: spec.preset?.type ? { ...spec.preset } : null,
    mineOnly: !!spec.mineOnly,
    scoringMode: spec.scoringMode || null,
  };
  if (spec.mineOnly && typeof dealsMineOnly !== "undefined") dealsMineOnly = true;
  if (spec.scoringMode) dealsTableScoringMode = spec.scoringMode;
}

function applyKanbanReportSpec(spec) {
  if (typeof kanbanFilters === "undefined") return;
  kanbanFilters = { q: "" };
  if (typeof kanbanMineOnly !== "undefined") kanbanMineOnly = false;
  if (!spec) {
    if (typeof kanbanMineOnly !== "undefined") {
      kanbanMineOnly = localStorage.getItem("itmen_kanban_mine") === "1";
    }
    return;
  }
  kanbanFilters = { ...(spec.filters || {}) };
  if (spec.mineOnly && typeof kanbanMineOnly !== "undefined") kanbanMineOnly = true;
}

function captureListReturnHash(returnPage) {
  const page = returnPage || (typeof activePage !== "undefined" ? activePage : "") || "deals";
  if (page === "deals") return serializeDealsReportSpec(buildDealsReportSpec());
  if (page === "kanban") return serializeKanbanSpec(buildKanbanReportSpec());
  return (location.hash || "").replace(/^#/, "") || (typeof withWorkspaceHash === "function" ? withWorkspaceHash(page) : page);
}

function restoreNavigationFromHash(raw) {
  const parsed = parseHashRaw(raw);
  if (parsed.page === "deals") {
    if (typeof navigate === "function") navigate("deals", parsed.spec);
    return;
  }
  if (parsed.page === "kanban") {
    if (typeof navigate === "function") navigate("kanban", parsed.kanbanSpec);
    return;
  }
  if (typeof navigate === "function") navigate(parsed.page || "deals");
}

function updateKanbanReportHash(spec) {
  const hash = serializeKanbanSpec(spec || buildKanbanReportSpec());
  if (location.hash.replace(/^#/, "") !== hash) {
    history.replaceState(null, "", "#" + hash);
  }
}

function syncDealsReportFiltersToUI() {
  const gs = document.getElementById("deals-global-search");
  if (gs) gs.value = dealsTableSearch || "";
  const mineCb = document.getElementById("deals-mine-only");
  if (mineCb && typeof dealsMineOnly !== "undefined") mineCb.checked = !!dealsMineOnly;

  document.querySelectorAll("#deals-table .deals-col-filter").forEach(el => {
    const col = el.dataset.col;
    const bound = el.dataset.bound;
    if (bound) el.value = dealsTableColFilters[col + "__" + bound] || "";
    else el.value = dealsTableColFilters[col] || "";
  });

  document.querySelectorAll("#deals-table .deals-ms-filter").forEach(wrap => {
    const colKey = wrap.dataset.col;
    const selected = new Set(getMultiselectFilter(colKey));
    wrap.querySelectorAll(".deals-ms-cb").forEach(cb => {
      cb.checked = selected.has(cb.value);
    });
    updateMultiselectToggleLabel(colKey);
  });
}

function updateDealsReportHash(spec) {
  const hash = serializeDealsReportSpec(spec || buildDealsReportSpec(dealsTableColFilters, dealsTablePreset));
  if (location.hash.replace(/^#/, "") !== hash) {
    history.replaceState(null, "", "#" + hash);
  }
}

function filterDealsForReportSpec(deals, spec) {
  if (!spec) return deals || [];
  const scoringOpts = spec.scoringMode ? { mode: spec.scoringMode } : (
    typeof getDealsScoringOpts === "function" ? getDealsScoringOpts() : null
  );
  let rows = (deals || []).map(d => (typeof enrichDeal === "function" ? enrichDeal(d, scoringOpts) : d));
  if (spec.mineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) rows = rows.filter(d => mineFn(d));
  }
  const cols = typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : [];
  if (spec.filters && typeof dealMatchesAmoFilters === "function") {
    rows = rows.filter(d => dealMatchesAmoFilters(d, spec.filters, cols, scoringOpts));
  }
  if (spec.preset?.type && typeof applyPresetFilter === "function") {
    rows = applyPresetFilter(rows, spec.preset);
  }
  return rows;
}

function openDealsReport(spec) {
  navigate("deals", spec);
}

function readMultiDataset(el, singleKey, multiKey) {
  if (el.dataset[multiKey]) return el.dataset[multiKey].split("|");
  if (el.dataset[singleKey]) return [el.dataset[singleKey]];
  return null;
}

function decodeDrillHref(raw) {
  return String(raw || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function drillSpecFromHref(el) {
  let href = String(el?.href || el?.getAttribute("href") || "").trim();
  if (!href || href === "#") return null;
  href = decodeDrillHref(href);
  const hashIdx = href.indexOf("#");
  if (hashIdx >= 0) href = href.slice(hashIdx + 1);
  href = href.replace(/^#/, "");
  if (!href.startsWith("deals") && !/^\w+\/deals/.test(href)) return null;
  const parsed = parseHashRaw(href);
  return parsed?.page === "deals" ? parsed.spec : null;
}

function pickDrillFilters(drillEl) {
  const fromEl = drillSpecFromElement(drillEl)?.filters || {};
  const fromHref = drillSpecFromHref(drillEl)?.filters || {};
  const merged = { ...fromHref };
  Object.keys(fromEl).forEach(k => {
    const v = fromEl[k];
    if (Array.isArray(v) ? v.length : v != null && v !== "") merged[k] = v;
  });
  Object.keys(fromHref).forEach(k => {
    if (merged[k] == null || (Array.isArray(merged[k]) && !merged[k].length)) {
      const v = fromHref[k];
      if (Array.isArray(v) ? v.length : v != null && v !== "") merged[k] = v;
    }
  });
  return merged;
}

function drillSpecFromElement(el) {
  if (el.dataset.drillPreset) {
    const spec = buildDealsReportSpec({}, { type: el.dataset.drillPreset, value: el.dataset.drillPresetValue });
    const cat = readMultiDataset(el, "drillCategory", "drillCategories");
    if (cat) spec.filters.category = cat;
    const owner = readMultiDataset(el, "drillOwner", "drillOwners");
    if (owner) spec.filters.owner = owner;
    const stage = readMultiDataset(el, "drillStage", "drillStages");
    if (stage) spec.filters.stage = stage;
    const pStage = readMultiDataset(el, "drillPresaleStage", "drillPresaleStages");
    if (pStage) spec.filters.presaleStage = pStage;
    const bp = readMultiDataset(el, "drillBudgetPeriod", "drillBudgetPeriods");
    if (bp) spec.filters.budgetPeriod = bp;
    const bs = readMultiDataset(el, "drillBudgetStatus", "drillBudgetStatuses");
    if (bs) spec.filters.budgetStatus = bs;
    const cs = readMultiDataset(el, "drillCommitStatus", "drillCommitStatuses");
    if (cs) spec.filters.commitStatus = cs;
    if (el.dataset.drillScoreMin) spec.filters.score__from = el.dataset.drillScoreMin;
    return spec;
  }
  const filters = {};
  const cat = readMultiDataset(el, "drillCategory", "drillCategories");
  if (cat) filters.category = cat;
  const owner = readMultiDataset(el, "drillOwner", "drillOwners");
  if (owner) filters.owner = owner;
  const stage = readMultiDataset(el, "drillStage", "drillStages");
  if (stage) filters.stage = stage;
  const pStage = readMultiDataset(el, "drillPresaleStage", "drillPresaleStages");
  if (pStage) filters.presaleStage = pStage;
  const bp = readMultiDataset(el, "drillBudgetPeriod", "drillBudgetPeriods");
  if (bp) filters.budgetPeriod = bp;
  const bs = readMultiDataset(el, "drillBudgetStatus", "drillBudgetStatuses");
  if (bs) filters.budgetStatus = bs;
  const cs = readMultiDataset(el, "drillCommitStatus", "drillCommitStatuses");
  if (cs) filters.commitStatus = cs;
  if (el.dataset.drillScoreMin) filters.score__from = el.dataset.drillScoreMin;
  if (el.dataset.drillScoreMax) filters.score__to = el.dataset.drillScoreMax;
  if (el.dataset.drillCustomer) filters.customer = el.dataset.drillCustomer;
  return buildDealsReportSpec(filters, null);
}

function getDealsReportFilterSummary() {
  const parts = [];
  if (dealsTableScoringMode) {
    const lbl = scoringModeLabel(dealsTableScoringMode);
    if (lbl) parts.push(`Скоринг: ${lbl}`);
  }
  if (typeof dealsMineOnly !== "undefined" && dealsMineOnly) parts.push("Только мои");
  if (dealsTablePreset?.type) {
    const labels = {
      incomplete: "Неполные паспорта",
      passportBlocks: "Неполные по выбранным блокам",
      passportBlock: `Блок: ${dealsTablePreset.value || ""}`,
      riskTop: dealsTablePreset.value ? `Риск: ${dealsTablePreset.value}` : "Сделки с рисками",
      risk: "Флаги риска",
      pilot: "На пилоте",
      attention: "Требуют внимания",
      hotNoBudget: "Горячие без бюджета",
      overdue: "Просроченные задачи",
      overdue_tasks: "Просроченные задачи",
      no_tasks: "Без задач",
      segment: `Сегмент: ${dealsTablePreset.value || ""}`,
      competitor: `Конкурент: ${dealsTablePreset.value || ""}`,
      hasCompetitors: "Сделки с конкурентами",
      strongCommits: "Сильные коммиты",
      confirmedBudget: "Подтверждённый бюджет",
      pipelineDelta: "Изменения суммы пайплайна",
      weightedDelta: "Изменения взвешенного прогноза",
      scoreDelta: "Изменения балла",
      dealCountDelta: "Изменения числа сделок",
      presalePipeline: "Пре-сейл воронка",
      presaleActive: "Активные пилоты",
      presaleSuccess: "Успешные пре-сейл",
      presaleFailed: "Провалы пре-сейл",
      presaleOverdue: "Затянувшиеся пилоты",
      presaleNoStage: "Без этапа пре-сейл",
      dealIds: "Выбранные сделки",
    };
    parts.push(labels[dealsTablePreset.type] || dealsTablePreset.type);
  }
  DEALS_TABLE_COLS.forEach(col => {
    if (col.filter === "range") {
      const from = dealsTableColFilters[col.key + "__from"];
      const to = dealsTableColFilters[col.key + "__to"];
      if (from || to) parts.push(`${col.label}: ${from || "…"}–${to || "…"}`);
      return;
    }
    if (col.filter === "multiselect") {
      const sel = getMultiselectFilter(col.key);
      if (sel.length) parts.push(`${col.label}: ${sel.join(", ")}`);
      return;
    }
    const f = dealsTableColFilters[col.key];
    if (f) parts.push(`${col.label}: ${f}`);
  });
  return parts;
}

function copyDealsReportLink() {
  const spec = buildDealsReportSpecFromTable();
  const url = `${location.origin}${location.pathname}#${serializeDealsReportSpec(spec)}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast("Ссылка на отчёт скопирована");
  }).catch(() => {
    prompt("Скопируйте ссылку:", url);
  });
}

function metricCardDrill(label, value, sub, drillAttrs = "") {
  if (!drillAttrs) {
    return `<div class="metric-card">
    <div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  }
  return `<a class="metric-card metric-card--drill dash-drill-link" ${drillAttrs} onclick="return dashDrillLinkClick(event)" title="Открыть список сделок (колёсико или ПКМ — в новой вкладке)">
    <div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</a>`;
}

function resolveDrillReportSpec(spec, widgetId) {
  let full = spec;
  if (widgetId && typeof withWidgetFilters === "function") full = withWidgetFilters(widgetId, full);
  return full;
}

function drillRowDataAttrs(spec, widgetId) {
  const el = document.createElement("div");
  const fullSpec = resolveDrillReportSpec(spec, widgetId);
  if (fullSpec.preset?.type) el.dataset.drillPreset = fullSpec.preset.type;
  if (fullSpec.preset?.value) el.dataset.drillPresetValue = fullSpec.preset.value;
  const f = fullSpec.filters || {};
  const setMulti = (attr, val) => {
    if (!val) return;
    const arr = Array.isArray(val) ? val : [val];
    if (arr.length === 1) el.dataset[attr] = arr[0];
    else if (arr.length > 1) el.dataset[attr + "s"] = arr.join("|");
  };
  setMulti("drillCategory", f.category);
  setMulti("drillOwner", f.owner);
  setMulti("drillStage", f.stage);
  setMulti("drillPresaleStage", f.presaleStage);
  setMulti("drillBudgetPeriod", f.budgetPeriod);
  setMulti("drillBudgetStatus", f.budgetStatus);
  setMulti("drillCommitStatus", f.commitStatus);
  if (f.score__from) el.dataset.drillScoreMin = f.score__from;
  if (f.score__to) el.dataset.drillScoreMax = f.score__to;
  if (f.customer) el.dataset.drillCustomer = f.customer;
  return [...el.attributes].map(a => `${a.name}="${escapeHtml(a.value)}"`).join(" ");
}

function drillLinkAttrs(spec, widgetId) {
  const fullSpec = resolveDrillReportSpec(spec, widgetId);
  const hash = serializeDealsReportSpec(fullSpec);
  const href = `#${hash}`.replace(/"/g, "&quot;");
  const dataAttrs = drillRowDataAttrs(fullSpec, widgetId);
  return `href="${href}"${dataAttrs ? ` ${dataAttrs}` : ""}`;
}

function drillRowAttrs(spec, widgetId) {
  return drillRowDataAttrs(spec, widgetId);
}

function openDashDrillInNewTab(drillEl) {
  if (!drillEl || typeof serializeDealsReportSpec !== "function") return;
  const spec = typeof buildDashDrillSpec === "function"
    ? buildDashDrillSpec(drillEl)
    : (typeof withDashboardFilters === "function" && typeof drillSpecFromElement === "function"
      ? withDashboardFilters(drillSpecFromElement(drillEl))
      : buildDealsReportSpec());
  const url = `${location.origin}${location.pathname}#${serializeDealsReportSpec(spec)}`;
  window.open(url, "_blank", "noopener");
}

function dashDrillLinkClick(ev) {
  if (!ev) return true;
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1) return true;
  ev.preventDefault();
  const el = ev.currentTarget;
  const presaleDash = el.closest("[data-presale-dash]");
  if (presaleDash && typeof openPresaleDealsReportFromDrill === "function") {
    openPresaleDealsReportFromDrill(el);
  } else if (typeof openDealsReportFromDashDrill === "function") {
    openDealsReportFromDashDrill(el);
  } else if (typeof openDealsReport === "function" && typeof buildDashDrillSpec === "function") {
    let spec = buildDashDrillSpec(el);
    if (spec?.preset?.type === "dealIds") {
      spec = buildDealsReportSpec(
        spec.filters || {},
        null,
        spec.mineOnly,
        spec.scoringMode,
        { skipTableSearch: true },
      );
    }
    openDealsReport(spec);
  } else if (typeof openDealsReport === "function" && typeof drillSpecFromElement === "function" && typeof withDashboardFilters === "function") {
    openDealsReport(withDashboardFilters(drillSpecFromElement(el)));
  }
  return false;
}

window.splitWorkspaceFromHash = splitWorkspaceFromHash;
window.withWorkspaceHash = withWorkspaceHash;
window.getWorkspaceHashPrefix = getWorkspaceHashPrefix;
window.drillSpecFromHref = drillSpecFromHref;
window.pickDrillFilters = pickDrillFilters;
window.filterDealsForReportSpec = filterDealsForReportSpec;
window.applyPresetFilter = applyPresetFilter;
window.applyDealsReportSpec = applyDealsReportSpec;
window.getDealsScoringOpts = getDealsScoringOpts;
window.buildDealsReportSpecFromTable = buildDealsReportSpecFromTable;
window.dashDrillLinkClick = dashDrillLinkClick;
window.openDashDrillInNewTab = openDashDrillInNewTab;
window.drillLinkAttrs = drillLinkAttrs;
window.drillRowAttrs = drillRowAttrs;
