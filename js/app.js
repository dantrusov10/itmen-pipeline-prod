/* ITMen Q3 — пайплайн: дашборд, паспорт сделок, скоринг */
const STORAGE_KEY = "itmen_pipeline_v2";
const PAGES = {
  panel: { title: "Дашборд пайплайна", icon: "📊" },
  deals: { title: "Сделки", icon: "📋" },
  kanban: { title: "Канбан", icon: "📌" },
  calendar: { title: "Календарь", icon: "📅" },
  reports: { title: "Отчёты", icon: "📈" },
  scoring: { title: "Модель скоринга", icon: "⚖️" },
  profile: { title: "Профиль", icon: "👤" },
  activities: { title: "Активности", icon: "📜", adminOnly: true },
};

let state = null;
let editingDealIdx = null;
let modalSuggestion = null;
let saveInFlight = null;
let dealModalOpenToken = 0;
let dealModalOpening = false;
let metricsCache = null;
let activePage = "panel";
let activeDealId = "";
let dashboardFilters = { owner: [], category: [], budgetPeriod: [], stage: [], partner: [], commitStatus: [], budgetStatus: [] };
let dashboardAmoFilters = {};
let dashboardFilterOpen = false;
const INACTIVE_OWNERS = ["Павел Витков"];
let dashboardMineOnly = localStorage.getItem("itmen_dash_mine") === "1";
const DASH_SCORING_MODE_KEY = "itmen_dash_scoring_mode";
let dashboardScoringMode = localStorage.getItem(DASH_SCORING_MODE_KEY) || "with_prob";
let dashboardEventsBound = false;

function getDashboardScoringOpts() {
  return { mode: dashboardScoringMode || "with_prob" };
}

function dashScoringModeLabel() {
  if (dashboardScoringMode === "prob_only") return "только вероятность менеджера";
  if (dashboardScoringMode === "no_prob") return "без вероятности менеджера";
  return "с вероятностью менеджера (20%)";
}

function syncDashboardScoringModeFromUi() {
  const probOnly = document.getElementById("dash-prob-only")?.checked;
  const useProb = document.getElementById("dash-use-prob")?.checked;
  if (probOnly) dashboardScoringMode = "prob_only";
  else if (useProb) dashboardScoringMode = "with_prob";
  else dashboardScoringMode = "no_prob";
  localStorage.setItem(DASH_SCORING_MODE_KEY, dashboardScoringMode);
}

window.getDashboardScoringOpts = getDashboardScoringOpts;

function invalidateMetricsCache() {
  metricsCache = null;
  if (typeof dynamicsData !== "undefined") dynamicsData = null;
}

function dealStageFilterIncludesRejected(selectedStages) {
  return Array.isArray(selectedStages) && selectedStages.length > 0 && selectedStages.includes("Отказ");
}

const DASHBOARD_SUCCESS_STAGES = ["Успешно реализовано", "Отгружен"];

function dealStageFilterIncludesSuccess(selectedStages) {
  return Array.isArray(selectedStages) && selectedStages.length > 0
    && DASHBOARD_SUCCESS_STAGES.some(s => selectedStages.includes(s));
}

function applyDefaultExcludeRejected(deals, selectedStages) {
  if (dealStageFilterIncludesRejected(selectedStages)) return deals;
  return deals.filter(d => (d.stage || "") !== "Отказ");
}

function applyDefaultExcludeSuccess(deals, selectedStages) {
  if (dealStageFilterIncludesSuccess(selectedStages)) return deals;
  return deals.filter(d => !DASHBOARD_SUCCESS_STAGES.includes(d.stage || ""));
}

function getAdminOwnerNames() {
  return state?.adminOwners || [];
}

function ownerFilterIncludesAdmin(selectedOwners) {
  if (!Array.isArray(selectedOwners) || !selectedOwners.length) return false;
  const admins = new Set(getAdminOwnerNames());
  return selectedOwners.some(o => admins.has(o));
}

function isMineFilterActive() {
  if (typeof dealsMineOnly !== "undefined" && dealsMineOnly) return true;
  if (typeof dashboardMineOnly !== "undefined" && dashboardMineOnly) return true;
  if (typeof kanbanMineOnly !== "undefined" && kanbanMineOnly) return true;
  if (typeof presaleKanbanMineOnly !== "undefined" && presaleKanbanMineOnly) return true;
  return ["itmen_deals_mine", "itmen_dash_mine", "itmen_kanban_mine", "itmen_presale_kanban_mine"]
    .some(k => localStorage.getItem(k) === "1");
}

function applyDefaultExcludeAdminOwners(deals, selectedOwners) {
  if (ownerFilterIncludesAdmin(selectedOwners)) return deals;
  if (isMineFilterActive()) return deals;
  const admins = new Set(getAdminOwnerNames());
  if (!admins.size) return deals;
  return deals.filter(d => !admins.has(d.owner || ""));
}

window.isMineFilterActive = isMineFilterActive;

function getDashboardBaselineDealCount() {
  return (state?.deals || []).filter(d => !d.archived).length;
}

function dashCountSub(count, total, suffix = "") {
  const t = total || 0;
  const c = count ?? 0;
  const pct = t ? Math.round((c / t) * 100) : 0;
  const line = `${pct}% · ${c} из ${t}`;
  return suffix ? `${line} · ${suffix}` : line;
}

function dashMoneySub(part, total, suffix = "") {
  const t = total || 0;
  const p = part || 0;
  const pct = t ? Math.round((p / t) * 100) : 0;
  const line = `${pct}% · ${formatMoney(p)} из ${formatMoney(t)}`;
  return suffix ? `${line} · ${suffix}` : line;
}

function getEnrichedDeals() {
  const scoringOpts = typeof getDealsScoringOpts === "function" ? getDealsScoringOpts() : null;
  let deals = (state.deals || []).map(d => enrichDeal(d, scoringOpts));
  if (typeof getWorkspaceDeals === "function") {
    deals = getWorkspaceDeals(deals);
  } else if (typeof isPresaleWorkspace === "function" && isPresaleWorkspace()) {
    deals = deals.filter(d => typeof dealInPresaleFunnel === "function" ? dealInPresaleFunnel(d) : true);
  }
  return deals;
}

function getDashboardDeals() {
  let deals = getDealsBaseSlice ? getDealsBaseSlice() : (state?.deals || []);
  if (typeof getWorkspaceDeals === "function") {
    deals = getWorkspaceDeals(deals);
  } else if (typeof isPresaleWorkspace === "function" && isPresaleWorkspace()) {
    deals = deals.filter(d => typeof dealInPresaleFunnel === "function" ? dealInPresaleFunnel(d) : true);
  }
  if (!getDealsBaseSlice && dashboardMineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) deals = deals.filter(d => mineFn(d));
  }
  if (typeof applyDealFilters === "function") {
    return applyDealFilters(deals, {}, dashboardAmoFilters, { scoringOpts: getDashboardScoringOpts() });
  }
  const cols = typeof getUnifiedFilterCols === "function" ? getUnifiedFilterCols() : [];
  const stageSel = typeof amoFilterGetMultiselect === "function"
    ? amoFilterGetMultiselect(dashboardAmoFilters, "stage") : [];
  const ownerSel = typeof amoFilterGetMultiselect === "function"
    ? amoFilterGetMultiselect(dashboardAmoFilters, "owner") : [];
  deals = applyDefaultExcludeRejected(deals, stageSel);
  deals = applyDefaultExcludeSuccess(deals, stageSel);
  deals = applyDefaultExcludeAdminOwners(deals, ownerSel);
  if (typeof dealMatchesAmoFilters === "function") {
    deals = deals.filter(d => dealMatchesAmoFilters(d, dashboardAmoFilters, cols, getDashboardScoringOpts()));
  }
  return deals;
}

function getDashboardOwners() {
  const fromDeals = new Set((state?.deals || []).map(d => d.owner).filter(Boolean));
  const order = (state?.lists?.owners || []).filter(o => !INACTIVE_OWNERS.includes(o));
  const owners = order.filter(o => fromDeals.has(o));
  fromDeals.forEach(o => {
    if (!INACTIVE_OWNERS.includes(o) && !owners.includes(o)) owners.push(o);
  });
  return owners.sort((a, b) => a.localeCompare(b, "ru"));
}

function ownerSelectOptions(extraOwner) {
  const byKey = new Map();
  const add = n => {
    const display = String(n || "").trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    if (!display || INACTIVE_OWNERS.includes(display)) return;
    const key = display.normalize("NFC").toLowerCase();
    if (!byKey.has(key)) byKey.set(key, display);
  };
  (state?.lists?.owners || []).forEach(add);
  (state?.crmOwners || []).forEach(add);
  if (extraOwner) add(extraOwner);
  const self = window.ITMEN_AUTH?.user?.managerName || window.ITMEN_AUTH?.user?.displayName;
  if (self) add(self);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "ru"));
}

async function syncCrmOwnersList() {
  if (!window.ITMEN_API?.enabled) return;
  try {
    const data = await apiLoadOwnerCandidates();
    state.crmOwners = data.owners || [];
    state.adminOwners = data.adminOwners || [];
    const set = new Set([...(state.lists?.owners || []), ...state.crmOwners]);
    state.lists.owners = [...set].filter(o => !INACTIVE_OWNERS.includes(o))
      .sort((a, b) => a.localeCompare(b, "ru"));
  } catch (e) {
    console.warn("syncCrmOwnersList:", e);
  }
}

async function syncAmoUserMap() {
  if (!window.ITMEN_API?.enabled || typeof apiLoadAmoUserMap !== "function") return;
  try {
    const data = await apiLoadAmoUserMap();
    window.ITMEN_AMO_USER_BY_ID = data?.byId || {};
  } catch (e) {
    console.warn("syncAmoUserMap:", e);
  }
}

function dashStageOptions() {
  if (typeof salesStageOptions === "function") return salesStageOptions();
  const base = state?.lists?.stages || window.ITMEN_INITIAL?.lists?.stages || [];
  const all = [...base];
  (state?.deals || []).forEach(d => {
    const s = d.stage;
    if (s && !all.includes(s)) all.push(s);
  });
  if (!all.includes("Отказ")) all.push("Отказ");
  return all;
}

function pipelineStageOptions() {
  return dashStageOptions();
}

function managerLossReasonOptions() {
  return [
    "Нет бюджета",
    "Выбрали конкурента",
    "Проект заморожен",
    "Нет ЛПР / контакта",
    "Не подошло решение",
    "Сроки не совпали",
    "Другое",
  ];
}

function lossReasonOptions() {
  const fromList = state?.lists?.loss_reasons || window.ITMEN_INITIAL?.lists?.loss_reasons;
  const canonical = managerLossReasonOptions();
  if (!fromList?.length) return canonical;
  return canonical.filter(r => fromList.includes(r)).length === canonical.length ? canonical : canonical;
}

function renderLossCompetitorField(d) {
  const catalog = typeof getGlobalCatalog === "function" ? getGlobalCatalog() : [];
  const cur = d?.lossCompetitorKey || "";
  const opts = catalog.map(c =>
    `<option value="${escapeHtml(c.key)}"${c.key === cur ? " selected" : ""}>${escapeHtml(c.label)}</option>`
  ).join("");
  return `<div id="loss-competitor-wrap" class="full" style="display:none">
    <label>Какой конкурент выбран <span class="req">*</span></label>
    <select id="f-lossCompetitorKey"><option value="">— выберите из реестра —</option>${opts}</select>
  </div>`;
}

function renderLossSolutionFields(d) {
  const segments = window.ITMEN_CONFIG?.techSegments || [];
  const selected = new Set(d?.lossSolutionSegments || []);
  const boxes = segments.map(s =>
    `<label class="loss-seg-opt"><input type="checkbox" class="loss-solution-seg-cb" value="${escapeHtml(s.id)}"${selected.has(s.id) ? " checked" : ""}> ${escapeHtml(s.label)}</label>`
  ).join("");
  const otherChecked = selected.has("other");
  const disc = d?.lossItmenDiscoveryOnly;
  return `<div id="loss-solution-wrap" class="full" style="display:none">
    <label>Что искали <span class="req">*</span></label>
    <div class="loss-seg-grid">${boxes}
      <label class="loss-seg-opt"><input type="checkbox" class="loss-solution-seg-cb" value="other"${otherChecked ? " checked" : ""}> Другое</label>
    </div>
    <div id="loss-discovery-wrap" style="display:none;margin-top:.75rem">
      <label>В рамках комплексного проекта не подошёл именно ITMEN, как Discovery? <span class="req">*</span></label>
      <select id="f-lossItmenDiscoveryOnly">
        <option value="">—</option>
        <option value="1"${disc === true ? " selected" : ""}>Да</option>
        <option value="0"${disc === false ? " selected" : ""}>Нет</option>
      </select>
    </div>
  </div>`;
}

function renderLossOtherField(d) {
  return `<div id="loss-other-wrap" class="full" style="display:none">
    <label>Комментарий к отказу</label>
    <textarea class="auto-grow" id="f-lossOtherComment" rows="2">${escapeHtml(d?.lossOtherComment || "")}</textarea>
  </div>`;
}

function renderLossDetailFields(d) {
  return `${renderLossCompetitorField(d)}${renderLossSolutionFields(d)}${renderLossOtherField(d)}`;
}

function selectedLossSolutionSegments() {
  return [...document.querySelectorAll(".loss-solution-seg-cb:checked")].map(cb => cb.value);
}

function updateLossDiscoveryQuestionVisibility() {
  const wrap = document.getElementById("loss-discovery-wrap");
  if (!wrap) return;
  const segs = selectedLossSolutionSegments();
  const hasDiscovery = segs.includes("discovery");
  const onlyDiscovery = segs.length === 1 && hasDiscovery;
  wrap.style.display = hasDiscovery && !onlyDiscovery ? "" : "none";
}

function toggleLossDetailFields() {
  const reason = val("f-lossReason");
  const stage = val("f-stage");
  const show = stage === "Отказ";
  const comp = document.getElementById("loss-competitor-wrap");
  const sol = document.getElementById("loss-solution-wrap");
  const other = document.getElementById("loss-other-wrap");
  if (comp) comp.style.display = show && reason === "Выбрали конкурента" ? "" : "none";
  if (sol) sol.style.display = show && reason === "Не подошло решение" ? "" : "none";
  if (other) other.style.display = show && reason === "Другое" ? "" : "none";
  updateLossDiscoveryQuestionVisibility();
}

function toggleLossReasonField() {
  const wrap = document.getElementById("loss-reason-wrap");
  if (!wrap) return;
  const show = val("f-stage") === "Отказ";
  wrap.style.display = show ? "" : "none";
  toggleLossDetailFields();
}

function dashBudgetPeriodOptions() {
  const base = state?.lists?.budgetPeriods || window.ITMEN_CONFIG?.budgetPeriods || [];
  const all = [...base];
  (state?.deals || []).forEach(d => {
    const p = d.budgetPeriod || "Не определён";
    if (!all.includes(p)) all.push(p);
  });
  return all;
}

function dashCategoryOptions() {
  return ["Горячая", "Тёплая", "Наблюдение", "Отказ"];
}

function dashPartnerOptions() {
  const partners = new Set();
  (state?.deals || []).forEach(d => partners.add((d.partner || "").trim() || "Без партнёра"));
  const base = state?.lists?.partners || [];
  const all = base.filter(p => partners.has(p));
  partners.forEach(p => { if (!all.includes(p)) all.push(p); });
  return all.sort((a, b) => a.localeCompare(b, "ru"));
}

function dashCommitOptions() {
  return (window.ITMEN_CONFIG?.commitStatuses || []).map(c => c.label);
}

function dashBudgetStatusOptions() {
  const base = state?.lists?.budgetStatus || window.ITMEN_CONFIG?.budgetStatuses || [];
  const all = [...base];
  (state?.deals || []).forEach(d => {
    const s = d.budgetStatus || "Неизвестно";
    if (!all.includes(s)) all.push(s);
  });
  return all;
}

function renderDashFilterField(title, multiselectHtml) {
  return `<div class="dash-filter-field">
    <span class="dash-filter-label">${escapeHtml(title)}</span>
    ${multiselectHtml}
  </div>`;
}

function renderDashMultiselect(key, options, selected) {
  const sel = new Set(selected || []);
  const label = sel.size ? `${sel.size} выбр.` : "Все";
  const checkboxes = options.map(o =>
    `<label class="deals-ms-opt">
      <input type="checkbox" class="deals-ms-cb dash-ms-cb" data-dash-key="${key}" value="${escapeHtml(o)}"${sel.has(o) ? " checked" : ""}>
      <span>${escapeHtml(o)}</span>
    </label>`
  ).join("");
  return `<div class="deals-ms-filter dash-ms-filter" data-dash-key="${key}">
    <button type="button" class="deals-ms-toggle dash-ms-toggle" data-dash-key="${key}">${escapeHtml(label)} ▾</button>
    <div class="deals-ms-panel">
      <div class="deals-ms-actions">
        <button type="button" class="deals-ms-all dash-ms-all" data-dash-key="${key}">Выбрать все</button>
        <button type="button" class="deals-ms-clear dash-ms-clear" data-dash-key="${key}">Сбросить</button>
      </div>
      <div class="deals-ms-list">${checkboxes}</div>
    </div>
  </div>`;
}

function updateDashMultiselectLabel(key) {
  const wrap = document.querySelector(`.dash-ms-filter[data-dash-key="${key}"]`);
  if (!wrap) return;
  const checked = wrap.querySelectorAll(".dash-ms-cb:checked");
  const btn = wrap.querySelector(".dash-ms-toggle");
  if (btn) btn.textContent = (checked.length ? `${checked.length} выбр.` : "Все") + " ▾";
}

function syncDashMultiselect(key) {
  const wrap = document.querySelector(`.dash-ms-filter[data-dash-key="${key}"]`);
  if (!wrap) return;
  const checked = [...wrap.querySelectorAll(".dash-ms-cb:checked")].map(cb => cb.value);
  dashboardFilters[key] = checked.length ? checked : [];
  updateDashMultiselectLabel(key);
}

function closeDashMultiselectPanels(except) {
  document.querySelectorAll(".dash-ms-filter.open").forEach(el => {
    if (except && el === except) return;
    el.classList.remove("open");
  });
}

function dashFiltersCount() {
  return typeof amoFilterActiveCount === "function"
    ? amoFilterActiveCount(dashboardAmoFilters, getUnifiedFilterCols())
    : 0;
}

function getDashboardMainFilterCols() {
  return typeof getUnifiedFilterCols === "function" ? getUnifiedFilterCols() : [];
}

function closeDashFilterPop() {
  dashboardFilterOpen = false;
  const pop = document.getElementById("dash-filter-pop");
  if (pop) pop.hidden = true;
  if (typeof unregisterAmoFilterPop === "function") unregisterAmoFilterPop();
}

function openDashFilterPop(anchorBtn) {
  const pop = document.getElementById("dash-filter-pop");
  const inner = document.getElementById("dash-filter-inner");
  if (!pop) return;
  pop.hidden = false;
  mountAmoFilterPanel(inner || pop, {
    filters: dashboardAmoFilters,
    cols: getUnifiedFilterCols(),
    deals: state?.deals || [],
    onApply: f => {
      dashboardAmoFilters = { ...f };
      if (typeof invalidateRequirementsDashCache === "function") invalidateRequirementsDashCache();
      closeDashFilterPop();
      invalidateMetricsCache();
      renderPanel(getDashboardMetrics());
    },
    onReset: () => { dashboardAmoFilters = {}; },
    onClose: () => closeDashFilterPop(),
  });
  if (typeof registerAmoFilterPop === "function") {
    registerAmoFilterPop(pop, anchorBtn?.closest(".amo-filter-anchor") || anchorBtn, closeDashFilterPop);
  }
}

function mountDashboardFilterPanelsIfOpen() {
  if (!dashboardFilterOpen) return;
  const btn = document.getElementById("dash-filters-btn");
  openDashFilterPop(btn);
}

function dashFiltersActive() {
  return dashFiltersCount() > 0;
}

function bindDashboardEvents() {
  if (dashboardEventsBound) return;
  dashboardEventsBound = true;
  const el = document.getElementById("page-panel");
  if (!el) return;

  el.addEventListener("change", e => {
    if (e.target.id === "dash-mine-only") {
      dashboardMineOnly = e.target.checked;
      localStorage.setItem("itmen_dash_mine", dashboardMineOnly ? "1" : "0");
      if (typeof invalidateRequirementsDashCache === "function") invalidateRequirementsDashCache();
      invalidateMetricsCache();
      renderPanel(getDashboardMetrics());
      return;
    }
    if (e.target.id === "dash-use-prob" || e.target.id === "dash-prob-only") {
      if (e.target.id === "dash-prob-only" && e.target.checked) {
        const useEl = document.getElementById("dash-use-prob");
        if (useEl) useEl.checked = true;
      }
      syncDashboardScoringModeFromUi();
      if (typeof invalidateRequirementsDashCache === "function") invalidateRequirementsDashCache();
      const probOnlyEl = document.getElementById("dash-prob-only");
      const useEl = document.getElementById("dash-use-prob");
      if (probOnlyEl?.checked && useEl) useEl.disabled = true;
      else if (useEl) useEl.disabled = false;
      invalidateMetricsCache();
      renderPanel(getDashboardMetrics());
      return;
    }
    if (e.target.classList.contains("passport-block-cb")) {
      const checked = [...el.querySelectorAll(".passport-block-cb:checked")].map(cb => cb.value);
      passportBlockSelection = checked.length ? checked : ["basic"];
      persistPassportBlockSelection();
      invalidateMetricsCache();
      renderPanel(getDashboardMetrics());
      return;
    }
    if (e.target.classList.contains("dash-ms-cb")) {
      syncDashMultiselect(e.target.dataset.dashKey);
      renderPanel(getDashboardMetrics());
    }
  });

  el.addEventListener("click", e => {
    if (e.target.id === "dash-clear-filters") {
      dashboardAmoFilters = {};
      closeDashFilterPop();
      invalidateMetricsCache();
      renderPanel(getDashboardMetrics());
      return;
    }
    if (e.target.id === "dash-filters-btn") {
      e.stopPropagation();
      const btn = e.target;
      if (dashboardFilterOpen) {
        closeDashFilterPop();
      } else {
        dashboardFilterOpen = true;
        openDashFilterPop(btn);
      }
      return;
    }
    const toggle = e.target.closest(".dash-ms-toggle");
    if (toggle) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = toggle.closest(".dash-ms-filter");
      if (!wrap) return;
      const opening = !wrap.classList.contains("open");
      closeDashMultiselectPanels(opening ? wrap : null);
      wrap.classList.toggle("open", opening);
      return;
    }
    const clearBtn = e.target.closest(".dash-ms-clear");
    if (clearBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = clearBtn.dataset.dashKey;
      const wrap = clearBtn.closest(".dash-ms-filter");
      wrap?.querySelectorAll(".dash-ms-cb").forEach(cb => { cb.checked = false; });
      dashboardFilters[key] = [];
      updateDashMultiselectLabel(key);
      renderPanel(getDashboardMetrics());
      return;
    }
    const allBtn = e.target.closest(".dash-ms-all");
    if (allBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = allBtn.dataset.dashKey;
      const wrap = allBtn.closest(".dash-ms-filter");
      wrap?.querySelectorAll(".dash-ms-cb").forEach(cb => { cb.checked = true; });
      syncDashMultiselect(key);
      renderPanel(getDashboardMetrics());
      return;
    }
    if (e.target.closest(".deals-ms-opt")) {
      e.stopPropagation();
      return;
    }
    if (!e.target.closest(".dash-ms-filter")) closeDashMultiselectPanels();

    const drill = e.target.closest(".dash-drill-row, .metric-card--drill, a.dash-drill-link");
    if (drill) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (drill.classList.contains("dash-drill-link")) {
        if (drill.getAttribute("onclick")) return;
        if (typeof dashDrillLinkClick === "function") dashDrillLinkClick(e);
        return;
      }
      e.preventDefault();
      const presaleDash = drill.closest("[data-presale-dash]");
      if (presaleDash && typeof openPresaleDealsReportFromDrill === "function") {
        openPresaleDealsReportFromDrill(drill);
      } else if (typeof openDealsReportFromDashDrill === "function") {
        openDealsReportFromDashDrill(drill);
      } else {
        openDealsReport(withDashboardFilters(drillSpecFromElement(drill)));
      }
      return;
    }
    const passportDrill = e.target.closest(".passport-block-drill-btn");
    if (passportDrill) {
      e.preventDefault();
      e.stopPropagation();
      const blockId = passportDrill.dataset.passportBlock;
      if (blockId) openDealsReport(withDashboardFilters(buildDealsReportSpec({}, { type: "passportBlock", value: blockId })));
      return;
    }
  });

  el.addEventListener("auxclick", e => {
    if (e.button !== 1) return;
    const drill = e.target.closest(".dash-drill-row, .metric-card--drill, a.dash-drill-link");
    if (!drill) return;
    e.preventDefault();
    if (typeof openDashDrillInNewTab === "function") openDashDrillInNewTab(drill);
  });

  el.addEventListener("contextmenu", e => {
    const drill = e.target.closest(".dash-drill-row, .metric-card--drill, a.dash-drill-link");
    if (!drill) return;
    e.preventDefault();
    if (typeof openDashDrillInNewTab === "function") openDashDrillInNewTab(drill);
  });
}

function getDashboardMetrics() {
  return calcMetrics(getDashboardDeals(), getDashboardScoringOpts());
}

function getMetrics() {
  if (!metricsCache) metricsCache = calcMetrics(state.deals || []);
  return metricsCache;
}

async function loadStateFromServer(opts = {}) {
  if (window.ITMEN_API?.enabled) {
    try {
      const loaded = await apiLoadPipeline({ lite: opts.lite !== false });
      if (loaded) return migrateState(loaded);
      return migrateState(structuredClone(window.ITMEN_INITIAL));
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
  return loadStateLocal();
}

function countDealsWithCompetitors(s) {
  return (s?.deals || []).filter(d =>
    typeof dealHasCompetitors === "function" ? dealHasCompetitors(d) : false
  ).length;
}

/** Lite-синхронизация могла обрезать competitorEntries — подтягиваем полный пайплайн */
async function healStrippedCompetitorData() {
  if (!window.ITMEN_API?.enabled || sessionStorage.getItem("itmen_comp_heal_done")) return false;
  const total = (state?.deals || []).length;
  const withComp = countDealsWithCompetitors(state);
  if (total < 50 || withComp >= 8) return false;
  sessionStorage.setItem("itmen_comp_heal_done", "1");
  showSyncBanner("⟳ Восстанавливаем конкурентов с сервера…", "sync");
  try {
    const full = await apiLoadPipeline({ lite: false });
    if (!full?.deals?.length) return false;
    state = migrateState(full);
    persistStateCache(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    invalidateMetricsCache();
    return true;
  } catch (e) {
    console.warn("healStrippedCompetitorData:", e);
    return false;
  }
}

async function loadPipelineAfterServerCount(cached, lite, replaced) {
  if (replaced) {
    clearLocalPipelineCache();
    try {
      const full = await apiLoadPipeline({ lite: false });
      if (full?.deals?.length) return migrateState(full);
    } catch (e) {
      console.warn("full load after replace failed, using lite", e);
    }
    return migrateState(lite);
  }
  return mergeLiteState(cached, lite);
}

async function loadDealNextTaskDue() {
  if (!window.ITMEN_API?.enabled || typeof apiLoadDealNextTaskDue !== "function") return;
  try {
    const data = await apiLoadDealNextTaskDue();
    if (typeof setDealNextTaskDue === "function") setDealNextTaskDue(data.items || {});
  } catch (e) {
    console.warn("loadDealNextTaskDue:", e);
  }
}
window.loadDealNextTaskDue = loadDealNextTaskDue;

async function bootstrapPipelineFromServer() {
  const label = window.ITMEN_API?.backend === "pocketbase" ? "сервера" : "Google Таблицы";
  showSyncBanner(`⟳ Загрузка данных с ${label}…`, "sync");
  const cached = loadStateLocal();
  let lite;
  try {
    lite = await apiLoadPipeline({ lite: true });
  } catch (e) {
    if (cached?.deals?.length) {
      console.warn("pipeline load failed, using cache", e);
      state = migrateState(cached);
      await loadDealNextTaskDue();
      updateDealCountBadge();
      showSyncBanner(
        `⟳ Обновление с сервера… (пока кэш: ${cached.deals.length} сделок)`,
        "sync"
      );
      setTimeout(() => syncPipelineFromServerAndRefresh().catch(() => {}), 3000);
      return;
    }
    throw e;
  }
  if (!lite?.deals?.length) {
    if (cached?.deals?.length) {
      console.warn("lite pipeline empty, using local cache", cached.deals.length);
      state = migrateState(cached);
      await loadDealNextTaskDue();
      updateDealCountBadge();
      showSyncBanner(
        `⚠ Сервер вернул пустой ответ — показан кэш (${cached.deals.length} сделок). ` +
        `<button type="button" class="btn btn-sm" id="retry-load-btn">Повторить</button>`,
        "error"
      );
      document.getElementById("retry-load-btn")?.addEventListener("click", () => syncPipelineFromServer());
      return;
    }
    throw new Error("Пустой ответ сервера");
  }
  const localCount = (cached?.deals || []).length;
  const serverCount = lite.deals.length;
  const replaced = shouldReplaceLocalWithServer(cached, lite);
  state = await loadPipelineAfterServerCount(cached, lite, replaced);
  let healedCompetitors = false;
  if (await healStrippedCompetitorData()) {
    updateDealCountBadge();
    showSyncBanner(`✓ Конкуренты восстановлены (${countDealsWithCompetitors(state)} сделок)`, "ok");
    setTimeout(clearSyncBanner, 4000);
    healedCompetitors = true;
  }
  persistStateCache(state);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  await loadDealNextTaskDue();
  updateDealCountBadge();
  if (replaced && localCount < serverCount) {
    showSyncBanner(
      `✓ Загружено <strong>${serverCount}</strong> сделок с сервера` +
      (localCount ? ` (в браузере было ${localCount})` : "") +
      `. <button type="button" class="btn btn-sm" id="force-reload-btn">Полная перезагрузка</button>`,
      "ok"
    );
    document.getElementById("force-reload-btn")?.addEventListener("click", () => forceReloadFromServer());
    setTimeout(clearSyncBanner, 6000);
  } else if (!healedCompetitors) {
    clearSyncBanner();
  }
}

function updateDealCountBadge() {
  const n = typeof isPresaleWorkspace === "function" && isPresaleWorkspace()
    ? getEnrichedDeals().length
    : (state?.deals || []).length;
  const title = document.getElementById("page-title");
  if (!title) return;
  const base = PAGES[activePage]?.title || "Пайплайн";
  title.textContent = `${base} · ${n} сделок`;
}

async function syncPipelineFromServer() {
  if (!window.ITMEN_API?.enabled) return;
  try {
    showSyncBanner("⟳ Обновление данных с сервера…", "sync");
    const cached = state;
    const lite = await apiLoadPipeline({ lite: true });
    if (!lite) throw new Error("Пустой ответ сервера");
    const localCount = (cached?.deals || []).length;
    const serverCount = (lite?.deals || []).length;
    const replaced = shouldReplaceLocalWithServer(cached, lite);
    state = await loadPipelineAfterServerCount(cached, lite, replaced);
    const changed = replaced || isServerNewer(state, cached);
    persistStateCache(state);
    if (typeof syncCrmOwnersList === "function") await syncCrmOwnersList();
    if (typeof syncAmoUserMap === "function") await syncAmoUserMap();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    await loadDealNextTaskDue();
    invalidateMetricsCache();
    renderAll();
    updateDealCountBadge();
    if (replaced) {
      showSyncBanner(
        `✓ Загружено с сервера: ${serverCount} сделок (в браузере было ${localCount}). ` +
        `<button type="button" class="btn btn-sm" id="force-reload-btn">Полная перезагрузка</button>`,
        "ok"
      );
      document.getElementById("force-reload-btn")?.addEventListener("click", () => forceReloadFromServer());
      setTimeout(clearSyncBanner, 8000);
    } else if (changed) {
      showSyncBanner("✓ Данные обновлены с сервера", "ok");
      setTimeout(clearSyncBanner, 2500);
    } else {
      clearSyncBanner();
    }
  } catch (e) {
    console.error(e);
    showSyncBanner(
      `⚠ Не удалось обновить с сервера: ${escapeHtml(e.message || "ошибка")}. Показана локальная копия (${(state?.deals || []).length} сделок). ` +
      `<button type="button" class="btn btn-sm" id="retry-load-btn">Повторить</button> ` +
      `<button type="button" class="btn btn-sm" id="force-reload-btn">Загрузить с сервера</button>`,
      "error"
    );
    document.getElementById("retry-load-btn")?.addEventListener("click", () => syncPipelineFromServer());
    document.getElementById("force-reload-btn")?.addEventListener("click", () => forceReloadFromServer());
  }
}

async function forceReloadFromServer() {
  if (!window.ITMEN_API?.enabled) {
    alert("Сервер не подключён. Проверьте js/gas-config.js");
    return;
  }
  try {
    showSyncBanner("⟳ Загрузка с сервера…", "sync");
    const loaded = await apiLoadPipeline({ lite: true });
    if (!loaded?.deals?.length) {
      const cached = loadStateLocal();
      if (cached?.deals?.length) {
        state = migrateState(cached);
        persistStateCache(state);
        invalidateMetricsCache();
        renderAll();
        updateDealCountBadge();
        showSyncBanner(
          `⚠ Сервер вернул пустой ответ — показан кэш (${cached.deals.length} сделок). ` +
          `<button type="button" class="btn btn-sm" id="force-reload-btn">Повторить</button>`,
          "error"
        );
        document.getElementById("force-reload-btn")?.addEventListener("click", () => forceReloadFromServer());
        return;
      }
      throw new Error("Сервер вернул пустой пайплайн");
    }
    state = migrateState(loaded);
    persistStateCache(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    invalidateMetricsCache();
    renderAll();
    updateDealCountBadge();
    showSyncBanner(`✓ Загружено ${state.deals.length} сделок с сервера`, "ok");
    setTimeout(clearSyncBanner, 4000);
  } catch (e) {
    console.error(e);
    const cached = loadStateLocal();
    if (cached?.deals?.length) {
      state = migrateState(cached);
      invalidateMetricsCache();
      renderAll();
      updateDealCountBadge();
    }
    showSyncBanner(
      `⚠ Ошибка загрузки: ${escapeHtml(e.message || "ошибка")}. ` +
      (cached?.deals?.length ? `Показан кэш (${cached.deals.length} сделок). ` : "") +
      `<button type="button" class="btn btn-sm" id="force-reload-btn">Повторить</button>`,
      "error"
    );
    document.getElementById("force-reload-btn")?.addEventListener("click", () => forceReloadFromServer());
  }
}

function loadStateLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(PIPELINE_CACHE_KEY);
    if (saved) return migrateState(JSON.parse(saved));
    const legacy = localStorage.getItem("itmen_pipeline_v1");
    if (legacy) {
      const parsed = migrateState(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (_) {}
  return migrateState(structuredClone(window.ITMEN_INITIAL));
}

function migrateState(s) {
  s.deals = (s.deals || []).map(d => {
    const m = migrateDeal(d);
    if (m.budgetStatus === "Запланирован") m.budgetStatus = "Планируется согласование";
    if (m.techResearch) m.techResearch = typeof migrateTechResearch === "function" ? migrateTechResearch(m.techResearch) : m.techResearch;
    if (!m.updatedAt) m.updatedAt = s._savedAt || `${m.lastUpdate || "1970-01-01"}T12:00:00.000Z`;
    return m;
  });
  const init = window.ITMEN_INITIAL || {};
  const cfg = window.ITMEN_CONFIG || {};
  s.lists = { ...(s.lists || {}), ...(init.lists || {}) };
  if (cfg.budgetPeriods) s.lists.budgetPeriods = cfg.budgetPeriods;
  if (cfg.budgetStatuses) s.lists.budgetStatus = cfg.budgetStatuses;
  if (init.lists?.partners) s.lists.partners = init.lists.partners;
  if (s.lists?.owners?.includes("Не назначен")) {
    s.lists.owners = s.lists.owners.filter(o => o !== "Не назначен");
  }
  if (s.lists?.owners) {
    s.lists.owners = s.lists.owners.filter(o => !INACTIVE_OWNERS.includes(o));
  }
  if (!s.nextId) {
    const nums = s.deals.map(d => {
      const m = String(d.id || "").match(/D-(\d+)/);
      return m ? +m[1] : 0;
    });
    s.nextId = Math.max(0, ...nums, init.nextId || 0, 0) + 1;
  }
  syncScoringFromConfig(s);
  return s;
}

async function saveState(meta = {}) {
  if (saveInFlight) await saveInFlight;
  saveInFlight = (async () => {
    if (window.ITMEN_API?.backend === "pocketbase") {
      const bulk = meta.forceFull || (meta.deletedDealIds?.length > 0)
        || (meta.editedDealIds?.length !== 1);
      if (bulk && typeof isAdmin === "function" && !isAdmin()) {
        throw new Error("Массовые операции доступны только администратору");
      }
    }
    if (window.ITMEN_API?.enabled) {
      try {
        if (meta.forceFull) {
          const localCount = (state.deals || []).length;
          let serverCount = 0;
          try {
            const serverLite = await apiLoadPipeline({ lite: true });
            serverCount = (serverLite?.deals || []).length;
          } catch (_) {}
          if (serverCount >= 10 && localCount < serverCount * 0.5) {
            const ok = confirm(
              `Опасное сохранение: на сервере ${serverCount} сделок, у вас в браузере ${localCount}.\n\n` +
              "Полная перезапись удалит остальные сделки на сервере.\n\n" +
              "Нажмите «Отмена» и используйте «Загрузить с сервера», либо «ОК» только если уверены."
            );
            if (!ok) throw new Error("Сохранение отменено — загрузите данные с сервера");
          }
        }
        const res = await apiSavePipeline(state, {
          editedDealIds: meta.editedDealIds || [],
          deletedDealIds: meta.deletedDealIds || [],
          baseSavedAt: state._savedAt || null,
          forceFull: !!meta.forceFull,
        });
        if (res.state) {
          state = migrateState(res.state);
          persistStateCache(state);
        } else if (res.updatedAt) state._savedAt = res.updatedAt;
        if (res.dataEpoch != null) state._dataEpoch = res.dataEpoch;
        const n = res?.auditRows ?? 0;
        let auditNote = n > 0 ? ` · аудит: ${n} строк` : " · аудит: 0 изменений";
        if (res.conflicts?.length) {
          auditNote += ` · на сервере новее: ${res.conflicts.join(", ")}`;
        }
        showToast(typeof apiBackendLabel === "function"
          ? `Сохранено (${apiBackendLabel()})${auditNote}`
          : `Сохранено на сервере${auditNote}`);
      } catch (e) {
        alert("Ошибка сохранения: " + e.message);
        throw e;
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistStateCache(state);
      showToast(typeof apiBackendLabel === "function"
        ? `Сохранено (${apiBackendLabel()})`
        : "Данные сохранены локально");
    }
    invalidateMetricsCache();
  })();
  await saveInFlight;
  saveInFlight = null;
}

async function resetState() {
  if (typeof isAdmin === "function" && !isAdmin()) {
    alert("Сброс данных доступен только администратору");
    return;
  }
  if (!confirm("Сбросить все данные к начальным?")) return;
  state = migrateState(structuredClone(window.ITMEN_INITIAL));
  await saveState({ forceFull: true });
  renderAll();
  showToast("Данные сброшены");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function navigate(page, reportSpec, dealId) {
  let targetPage = page === "deal" ? "deal" : normalizePageId(page);
  if (targetPage === "activities" && typeof isAdmin === "function" && !isAdmin()) {
    showToast("Раздел «Активности» доступен только администраторам");
    targetPage = "panel";
  }
  activePage = targetPage;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav a").forEach(a => a.classList.remove("active"));
  document.getElementById("page-" + activePage)?.classList.add("active");
  if (activePage !== "deal") {
    document.querySelector(`.nav a[data-page="${activePage}"]`)?.classList.add("active");
  }
  updateDealCountBadge();
  document.body.classList.toggle("page-deals-active", activePage === "deals");
  document.body.classList.toggle("page-deal-active", activePage === "deal");
  document.body.classList.toggle("page-kanban-active", activePage === "kanban");
  if (activePage !== "deal" && typeof clearDealPageTopbar === "function") clearDealPageTopbar();
  document.getElementById("sidebar")?.classList.remove("open");
  if (activePage === "deals") {
    if (reportSpec !== undefined) applyDealsReportSpec(reportSpec);
    else applyDealsReportSpec(null);
    location.hash = reportSpec
      ? serializeDealsReportSpec(reportSpec)
      : (typeof withWorkspaceHash === "function" ? withWorkspaceHash("deals") : "deals");
    ensureArchitectureLoaded().catch(() => {});
  } else if (activePage === "kanban") {
    if (reportSpec !== undefined && typeof applyKanbanReportSpec === "function") applyKanbanReportSpec(reportSpec);
    else if (typeof applyKanbanReportSpec === "function") applyKanbanReportSpec(null);
    location.hash = reportSpec && typeof serializeKanbanSpec === "function"
      ? serializeKanbanSpec(reportSpec)
      : (typeof withWorkspaceHash === "function" ? withWorkspaceHash("kanban") : "kanban");
  } else if (activePage === "deal" && dealId) {
    activeDealId = dealId;
    location.hash = typeof withWorkspaceHash === "function"
      ? withWorkspaceHash("deal/" + encodeURIComponent(dealId))
      : "deal/" + encodeURIComponent(dealId);
  } else {
    location.hash = typeof withWorkspaceHash === "function"
      ? withWorkspaceHash(activePage)
      : activePage;
  }
  renderActivePage(dealId);
}

function renderActivePage(dealId) {
  try {
    const presaleWs = typeof isPresaleWorkspace === "function" && isPresaleWorkspace();
    const refWs = typeof isReferenceWorkspace === "function" && isReferenceWorkspace();
    if (activePage === "panel") {
      if (refWs && typeof renderReferencePanel === "function") renderReferencePanel();
      else if (presaleWs && typeof renderPresalePanel === "function") renderPresalePanel();
      else renderPanel(getDashboardMetrics());
      const panelEl = document.getElementById("page-panel");
      if (panelEl && !panelEl.innerHTML.trim()) renderPanel(getDashboardMetrics());
    }
    else if (activePage === "deals") {
      renderDealsTable(getEnrichedDeals());
      if (typeof syncDealsReportFiltersToUI === "function") syncDealsReportFiltersToUI();
      if (typeof renderDealsFilterBanner === "function") renderDealsFilterBanner();
    }
    else if (activePage === "deal" && typeof renderDealPage === "function") {
      renderDealPage(dealId || activeDealId || "");
    }
    else if (activePage === "kanban") {
      if (typeof renderActiveKanban === "function") renderActiveKanban();
      else if (presaleWs && typeof renderPresaleKanban === "function") renderPresaleKanban();
      else if (typeof renderKanban === "function") renderKanban();
    }
    else if (activePage === "calendar" && typeof renderCalendar === "function") renderCalendar();
    else if (activePage === "reports" && typeof renderReports === "function") renderReports();
    else if (activePage === "profile" && typeof renderProfile === "function") renderProfile();
    else if (activePage === "activities" && typeof renderActivitiesPage === "function") renderActivitiesPage();
    else if (activePage === "scoring") renderScoring();
    else {
      activePage = "panel";
      document.getElementById("page-panel")?.classList.add("active");
      renderPanel(getDashboardMetrics());
    }
  } catch (err) {
    console.error("renderActivePage failed:", err);
    const pageEl = document.getElementById("page-" + activePage) || document.getElementById("page-panel");
    if (pageEl) {
      pageEl.classList.add("active");
      pageEl.innerHTML = `<div class="card" style="margin:1rem;border-color:#f5c6cb">
        <div class="card-body">
          <strong>Ошибка отображения</strong>
          <p class="muted" style="margin:.5rem 0">${escapeHtml(err.message || String(err))}</p>
          <button type="button" class="btn btn-sm" onclick="location.reload()">Обновить страницу</button>
        </div>
      </div>`;
    }
  }
}

function renderAll() {
  invalidateMetricsCache();
  renderActivePage();
}

function metricCard(label, value, sub) {
  return metricCardDrill(label, value, sub, "");
}

function withDashboardFilters(spec) {
  const base = { ...(spec?.filters || {}) };
  const filters = typeof mergeAmoFiltersInto === "function"
    ? mergeAmoFiltersInto(base, dashboardAmoFilters || {}, true)
    : base;
  const mineOnly = spec?.mineOnly != null ? spec.mineOnly : !!dashboardMineOnly;
  return buildDealsReportSpec(filters, spec?.preset, mineOnly, dashboardScoringMode || spec?.scoringMode || null, { skipTableSearch: true });
}

function dashDrill(spec, widgetId) {
  return drillLinkAttrs(withDashboardFilters(spec), widgetId);
}

function strongCommitLabels() {
  return (window.ITMEN_CONFIG?.commitStatuses || [])
    .filter(c => ["protocol", "loi", "guarantee", "contract"].includes(c.id))
    .map(c => c.label);
}

function formatRuDealsCount(n, suffix = "") {
  const num = Number(n) || 0;
  const abs = Math.abs(num) % 100;
  const n1 = abs % 10;
  let word = "сделок";
  if (abs < 11 || abs > 14) {
    if (n1 === 1) word = "сделка";
    else if (n1 >= 2 && n1 <= 4) word = "сделки";
  }
  return suffix ? `${num} ${word} ${suffix}` : `${num} ${word}`;
}

function renderSuccessStageWidgetBody(widgetId, wm) {
  const stage = widgetId === "success-shipped" ? "Отгружен" : "Успешно реализовано";
  const n = wm.pipelineCount ?? wm.deals?.length ?? wm.n ?? 0;
  const pipeline = wm.totalPipeline ?? wm.pipeline ?? 0;
  const weighted = wm.weighted > 0 ? wm.weighted : pipeline;
  const color = widgetId === "success-shipped" ? "#2f855a" : "#276749";
  const attrs = typeof dashDrill === "function"
    ? dashDrill(buildDealsReportSpec({ stage: [stage] }), widgetId)
    : "";
  return `<div class="success-stage-widget">
    <div class="grid grid-3" style="margin-bottom:.75rem">
      <div class="metric-card"><div class="label">Сделок</div><div class="value" style="color:${color}">${n}</div></div>
      <div class="metric-card"><div class="label">Пайплайн</div><div class="value">${formatMoney(pipeline)}</div></div>
      <div class="metric-card"><div class="label">Взвеш.</div><div class="value">${formatMoney(weighted)}</div></div>
    </div>
    ${n ? `<a class="btn btn-sm dash-drill-link" ${attrs} onclick="return dashDrillLinkClick(event)">Открыть ${n} ${n === 1 ? "сделку" : n < 5 ? "сделки" : "сделок"}</a>` : `<div class="muted">Нет сделок на стадии «${escapeHtml(stage)}»</div>`}
  </div>`;
}

function buildDashRenderCtx(m) {
  const n = m.pipelineCount ?? m.deals?.length ?? 0;
  return {
    n,
    catTotal: Math.max(1, n),
    catColors: { "Горячая": "#c0392b", "Тёплая": "#e67e22", "Наблюдение": "#3498db", "Отказ": "#95a5a6" },
    maxCommit: Math.max(1, ...Object.values(m.commitCounts || {})),
    maxStage: Math.max(1, ...(m.stageFunnel || []).map(x => x.count), 1),
    maxPeriod: Math.max(1, ...(m.byBudgetPeriod || []).map(x => x.count), 1),
    ownerRows: Object.entries(m.byOwner || {}).sort((a, b) => b[1].weighted - a[1].weighted),
    budgetRows: Object.entries(m.byBudget || {}).sort((a, b) => b[1].pipeline - a[1].pipeline),
    compDealCount: m.dealsWithCompetitors ?? 0,
    compDealLabel: formatRuDealsCount(m.dealsWithCompetitors ?? 0, "с конкурентами"),
  };
}

function renderDashboardWidgetBody(widgetId, m) {
  const scoringOpts = typeof getDashboardScoringOpts === "function" ? getDashboardScoringOpts() : null;
  const wm = typeof getWidgetDeals === "function" ? calcMetrics(getWidgetDeals(widgetId), scoringOpts) : m;
  const ctx = buildDashRenderCtx(wm);
  const { n, catTotal, catColors, maxCommit, maxStage, maxPeriod, ownerRows, budgetRows, compDealCount, compDealLabel } = ctx;
  switch (widgetId) {
    case "passport-completeness":
      return typeof renderPassportCompletenessBody === "function" ? renderPassportCompletenessBody(wm, n) : "";
    case "top-risks":
      return typeof renderTopRisksBody === "function" ? renderTopRisksBody(wm) : "";
    case "loss-reasons":
      return typeof renderLossReasonsBody === "function" ? renderLossReasonsBody(wm) : "";
    case "success-realized":
    case "success-shipped":
      return renderSuccessStageWidgetBody(widgetId, wm);
    case "manager-passport":
      return typeof renderManagerPassportBody === "function" ? renderManagerPassportBody(wm) : "";
    case "dynamics":
      return `<div id="dynamics-block"></div>`;
    case "task-metrics":
      return typeof renderTaskDashboardBody === "function"
        ? renderTaskDashboardBody(null)
        : `<p class="muted">Загрузка метрик задач…</p>`;
    case "category-bars":
      return `<div class="category-bars">${["Горячая", "Тёплая", "Наблюдение", "Отказ"].map(cat => {
        const c = wm.counts[cat] || 0;
        return `<a class="cat-bar-row dash-drill-row dash-drill-link" ${dashDrill(buildDealsReportSpec({ category: [cat] }), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть список сделок (колёсико или ПКМ — в новой вкладке)">
          <span class="name">${cat}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(c / catTotal) * 100}%;background:${catColors[cat]}"></div></div>
          <span class="count">${c}</span>
          <span class="pct">${n ? Math.round(c / n * 100) : 0}%</span>
        </a>`;
      }).join("")}</div>`;
    case "budget-period":
      return `<div class="funnel">${(wm.byBudgetPeriod || []).map(({ period, count, pipeline }) => `
        <a class="funnel-row dash-drill-row dash-drill-link" ${dashDrill(buildDealsReportSpec({ budgetPeriod: [period] }), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть список сделок (колёсико или ПКМ — в новой вкладке)">
          <span class="name" title="${escapeHtml(period)}">${escapeHtml(period.length > 22 ? period.slice(0, 20) + "…" : period)}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(count / maxPeriod) * 100}%;background:#805ad5"></div></div>
          <span class="count">${count}</span>
          <span class="count muted" style="min-width:4.5rem;text-align:right">${formatMoney(pipeline)}</span>
        </a>`).join("") || "<div class='muted'>Нет данных по срокам</div>"}</div>`;
    case "commit-funnel":
      return `<div class="funnel">${Object.entries(wm.commitCounts || {}).map(([name, count]) => `
        <a class="funnel-row dash-drill-row dash-drill-link" ${dashDrill(buildDealsReportSpec({ commitStatus: [commitShortToLabel(name)] }), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть список сделок (колёсико или ПКМ — в новой вкладке)">
          <span class="name">${escapeHtml(name)}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(count / maxCommit) * 100}%"></div></div>
          <span class="count">${count}</span>
        </a>`).join("")}</div>`;
    case "owners-table":
      return `<div class="table-wrap"><table class="dash-table">
        <thead><tr><th>Менеджер</th><th>Сделок</th><th>Пайплайн</th><th>Взвеш.</th><th>Гор./Тёпл.</th><th>Балл</th><th>Неполн.</th><th>Проср.</th><th>Риски</th></tr></thead>
        <tbody>${ownerRows.map(([name, v]) => `<tr class="dash-drill-row dash-drill-link" ${drillRowAttrs(withDashboardFilters(buildDealsReportSpec({ owner: [name] })), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть сделки менеджера (колёсико или ПКМ — в новой вкладке)">
          <td>${escapeHtml(name)}</td><td>${v.count}</td>
          <td class="num">${formatMoney(v.pipeline)}</td>
          <td class="num">${formatMoney(v.weighted)}</td>
          <td>${v.hot}/${v.warm}</td>
          <td>${v.avgScore ?? "—"}</td>
          <td>${v.incomplete || 0}</td>
          <td>${v.overdue || 0}</td>
          <td>${v.risks || 0}</td>
        </tr>`).join("") || "<tr><td colspan='9' class='muted'>Нет данных</td></tr>"}
        </tbody></table></div>`;
    case "stage-funnel":
      return `<div class="funnel">${(wm.stageFunnel || []).map(({ stage, count }) => `
        <a class="funnel-row dash-drill-row dash-drill-link" ${dashDrill(buildDealsReportSpec({ stage: [stage] }), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть список сделок (колёсико или ПКМ — в новой вкладке)">
          <span class="name" title="${escapeHtml(stage)}">${escapeHtml(stage.length > 22 ? stage.slice(0, 20) + "…" : stage)}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(count / maxStage) * 100}%;background:#2c5282"></div></div>
          <span class="count">${count}</span>
        </a>`).join("") || "<div class='muted'>Нет сделок</div>"}</div>`;
    case "budget-status":
      return `<div class="table-wrap"><table class="dash-table">
        <thead><tr><th>Статус</th><th>Сделок</th><th>Сумма пайплайна</th></tr></thead>
        <tbody>${budgetRows.map(([st, v]) => `<tr class="dash-drill-row dash-drill-link" ${drillRowAttrs(withDashboardFilters(buildDealsReportSpec({ budgetStatus: [st] })), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть список сделок (колёсико или ПКМ — в новой вкладке)">
          <td>${escapeHtml(st)}</td><td>${v.count}</td><td class="num">${formatMoney(v.pipeline)}</td>
        </tr>`).join("") || "<tr><td colspan='3' class='muted'>—</td></tr>"}
        </tbody></table></div>`;
    case "segments":
      return `<div class="funnel">${(wm.topSegments || []).map(([seg, count]) => `
        <a class="funnel-row dash-drill-row dash-drill-link" ${dashDrill(buildDealsReportSpec({}, { type: "segment", value: seg }), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть список сделок (колёсико или ПКМ — в новой вкладке)">
          <span class="name">${escapeHtml(seg)}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(count / Math.max(1, wm.topSegments[0]?.[1] || 1)) * 100}%;background:#38a169"></div></div>
          <span class="count">${count}</span>
        </a>`).join("") || "<div class='muted'>Заполните блок «Что ищут» в паспортах</div>"}</div>`;
    case "competitors":
      return (wm.topCompetitors || []).length ? `<div class="funnel funnel-compact">${wm.topCompetitors.map(row => {
        const max = Math.max(1, wm.topCompetitors[0]?.mentions || 1);
        const label = competitorEntryLabel({ vendor: row.vendor, product: row.product });
        const topSt = Object.entries(row.statuses || {}).sort((a, b) => b[1] - a[1])[0];
        const stLabel = topSt ? ((window.ITMEN_CONFIG?.competitorStatuses || []).find(s => s.id === topSt[0])?.label || topSt[0]) : "";
        return `<a class="funnel-row dash-drill-row dash-drill-link" ${dashDrill(buildDealsReportSpec({}, { type: "competitor", value: row.key }), widgetId)} onclick="return dashDrillLinkClick(event)" title="${escapeHtml(label)} · ${row.dealCount} сделок (колёсико или ПКМ — в новой вкладке)">
          <span class="name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(row.mentions / max) * 100}%;background:#c05621"></div></div>
          <span class="count" title="${row.dealCount} сделок">${row.mentions}</span>
          ${stLabel ? `<span class="pct funnel-status"><small>${escapeHtml(stLabel)}</small></span>` : ""}
        </a>`;
      }).join("")}</div>` : "<div class='muted'>Заполните конкурентный анализ в паспортах сделок</div>";
    case "replacement-landscape":
      return (wm.topReplacements || []).length ? `<div class="funnel funnel-compact">${wm.topReplacements.map(row => {
        const max = Math.max(1, wm.topReplacements[0]?.mentions || 1);
        const productPart = row.product ? ` · ${row.product}` : "";
        const label = `${row.vendor || "—"}${productPart} · ${row.segment || "—"}`;
        return `<div class="funnel-row" title="${escapeHtml(label)} · ${row.dealCount} сделок">
          <span class="name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(row.mentions / max) * 100}%;background:#2b6cb0"></div></div>
          <span class="count" title="${row.dealCount} сделок">${row.mentions}</span>
        </div>`;
      }).join("")}</div>` : "<div class='muted'>Заполните блок «Что есть сейчас» в паспортах сделок</div>";
    case "competitor-status":
      return `<div class="table-wrap"><table class="dash-table">
        <thead><tr><th>Статус</th><th>Упоминаний</th></tr></thead>
        <tbody>${(wm.competitorStatusSummary || []).map(s => `<tr>
          <td>${escapeHtml(s.label)}</td><td class="num">${s.count}</td>
        </tr>`).join("") || "<tr><td colspan='2' class='muted'>Нет данных</td></tr>"}
        </tbody></table></div>`;
    case "budget-matrix":
      return typeof renderBudgetMatrix === "function" ? renderBudgetMatrix(wm) : "";
    case "top-deals":
      return `<div class="table-wrap"><table class="dash-table">
        <thead><tr><th>Клиент</th><th>Владелец</th><th>Стадия</th><th>Ожид. сумма</th><th>Взвеш.</th><th>Балл</th><th>Категория</th></tr></thead>
        <tbody>${(wm.topDeals || []).map(d => `<tr class="dash-drill-row dash-drill-link" ${drillRowAttrs(withDashboardFilters(buildDealsReportSpec({ customer: d.customer })), widgetId)} onclick="return dashDrillLinkClick(event)" title="Открыть в таблице (колёсико или ПКМ — в новой вкладке)">
          <td><strong>${escapeHtml(d.customer)}</strong></td>
          <td>${escapeHtml(d.owner)}</td>
          <td><small>${escapeHtml(d.stage)}</small></td>
          <td class="num">${formatMoney(d.expectedAmount ?? d.amount)}</td>
          <td class="num">${formatMoney(d.weighted)}</td>
          <td>${d.score ?? "—"}</td>
          <td>${categoryBadge(d.category)}</td>
        </tr>`).join("") || "<tr><td colspan='7' class='muted'>Нет сделок</td></tr>"}
        </tbody></table></div>`;
    case "attention":
      return (wm.attention || []).length ? `<div class="table-wrap"><table class="dash-table">
        <thead><tr><th>Клиент</th><th>Владелец</th><th>Проблема</th><th>Задача до</th><th></th></tr></thead>
        <tbody>${wm.attention.map(d => {
          const issues = [];
          if (d.quality === "Неполный") issues.push("Неполный паспорт");
          if (d.daysTo != null && d.daysTo < 0) issues.push("Просрочена задача");
          if (d.category === "Горячая" && d.budgetStatus === "Нет бюджета") issues.push("Горячая без бюджета");
          if (d.riskFlag && !issues.includes(d.riskFlag)) issues.push(d.riskFlag);
          const idx = state.deals.findIndex(x => x.id === d.id);
          return `<tr>
            <td>${escapeHtml(d.customer)}</td>
            <td>${escapeHtml(d.owner)}</td>
            <td>${issues.map(i => `<span class="badge badge-warn">${escapeHtml(i)}</span>`).join(" ")}</td>
            <td>${escapeHtml(d.taskDue)}${d.daysTo != null ? ` <small>(${d.daysTo} дн.)</small>` : ""}</td>
            <td>${idx >= 0 ? `<button class="btn btn-sm" onclick="openDealById('${escapeHtml(d.id)}')">✏️</button>` : ""}</td>
          </tr>`;
        }).join("")}
        </tbody></table></div>` : "<div class='muted'>Нет сделок, требующих внимания</div>";
    default:
      return "";
  }
}

window.renderDashboardWidgetBody = renderDashboardWidgetBody;

function renderPanel(m) {
  const el = document.getElementById("page-panel");
  if (!el) return;
  const n = m.pipelineCount ?? m.deals?.length ?? 0;
  const allActiveN = getDashboardBaselineDealCount();
  const watchDrop = (m.counts["Наблюдение"] || 0) + (m.counts["Отказ"] || 0);
  const passportAllCount = Math.round((m.passportAllBlocksPct || 0) * n);
  const ownerOptions = getDashboardOwners();
  const categoryOptions = dashCategoryOptions();
  const periodOptions = dashBudgetPeriodOptions();
  const stageOptions = dashStageOptions();
  const partnerOptions = dashPartnerOptions();
  const commitOptions = dashCommitOptions();
  const budgetStatusOptions = dashBudgetStatusOptions();
  const compDealCount = m.dealsWithCompetitors ?? 0;
  const replDealCount = m.dealsWithReplacements ?? 0;
  const compDealLabel = formatRuDealsCount(compDealCount, "с конкурентами");
  const replDealLabel = formatRuDealsCount(replDealCount, "с As-IS");
  const maxCommit = Math.max(1, ...Object.values(m.commitCounts || {}));
  const maxStage = Math.max(1, ...(m.stageFunnel || []).map(x => x.count));
  const maxPeriod = Math.max(1, ...(m.byBudgetPeriod || []).map(x => x.count));
  const catTotal = Math.max(1, n);
  const catColors = { "Горячая": "#c0392b", "Тёплая": "#e67e22", "Наблюдение": "#3498db", "Отказ": "#95a5a6" };
  const ownerRows = Object.entries(m.byOwner || {}).sort((a, b) => b[1].weighted - a[1].weighted);
  const budgetRows = Object.entries(m.byBudget || {}).sort((a, b) => b[1].pipeline - a[1].pipeline);

  const filterN = dashFiltersCount();
  const useProbChecked = dashboardScoringMode !== "no_prob";
  const probOnlyChecked = dashboardScoringMode === "prob_only";
  const scoringHint = dashScoringModeLabel();
  el.innerHTML = `
    <div class="dashboard-filters dashboard-filters-bar">
      <div class="amo-filter-anchor">
        <button type="button" class="btn btn-sm${dashboardFilterOpen ? " btn-primary" : ""}" id="dash-filters-btn">Фильтры${filterN ? ` (${filterN})` : ""}</button>
        <div class="amo-filter-pop dash-filter-pop" id="dash-filter-pop" ${dashboardFilterOpen ? "" : "hidden"}>
          <div id="dash-filter-inner"></div>
        </div>
      </div>
      <div class="dash-scoring-toggles">
        <label class="dash-mine-toggle muted" title="Вероятность менеджера участвует в балле и категории на дашборде">
          <input type="checkbox" id="dash-use-prob" ${useProbChecked ? "checked" : ""}${probOnlyChecked ? " disabled" : ""}> Учитывать вероятность менеджера
        </label>
        <label class="dash-mine-toggle muted" title="Балл и категория только по вероятности менеджера (вес 100%)">
          <input type="checkbox" id="dash-prob-only" ${probOnlyChecked ? "checked" : ""}> Только вероятность
        </label>
      </div>
      <label class="dash-mine-toggle muted"><input type="checkbox" id="dash-mine-only" ${dashboardMineOnly ? "checked" : ""}> Только мои сделки</label>
      ${dashFiltersActive() ? `<button type="button" class="btn btn-sm" id="dash-clear-filters">Сбросить</button>` : ""}
    </div>
    <p class="muted dash-scoring-hint" style="font-size:.78rem;margin:-.5rem 0 1rem">Скоринг на дашборде: <strong>${escapeHtml(scoringHint)}</strong></p>
    <div class="grid grid-4" style="margin-bottom:1rem">
      ${metricCardDrill("Сделок в пайплайне", n, dashCountSub(n, allActiveN, "в текущем срезе"), dashDrill(buildDealsReportSpec({}, null)))}
      ${metricCardDrill("Общий пайплайн", formatMoney(m.totalPipeline), dashCountSub(n, allActiveN, "сумма ожидаемых сумм"), dashDrill(buildDealsReportSpec({}, null)))}
      ${metricCardDrill("Взвешенный прогноз", formatMoney(m.weighted), dashMoneySub(m.weighted, m.totalPipeline, "тёплые + горячие (балл ≥ 60)"), dashDrill(buildDealsReportSpec({ category: ["Горячая", "Тёплая"], score__from: "60" })))}
      ${metricCardDrill("Подтв. бюджет", m.confirmedBudget, dashCountSub(m.confirmedBudget, n, formatMoney(m.confirmedBudgetSum)), dashDrill(buildDealsReportSpec({ budgetStatus: ["Подтверждён"] }, { type: "confirmedBudget" })))}
    </div>
    <div class="grid grid-4" style="margin-bottom:1rem">
      ${metricCardDrill("Горячие", m.counts["Горячая"] || 0, dashCountSub(m.counts["Горячая"] || 0, n), dashDrill(buildDealsReportSpec({ category: ["Горячая"] })))}
      ${metricCardDrill("Тёплые", m.counts["Тёплая"] || 0, dashCountSub(m.counts["Тёплая"] || 0, n), dashDrill(buildDealsReportSpec({ category: ["Тёплая"] })))}
      ${metricCardDrill("На пилоте", m.inPilot || 0, dashCountSub(m.inPilot || 0, n, "стадии пилота"), dashDrill(buildDealsReportSpec({}, { type: "pilot" })))}
      ${metricCardDrill("Тех. соответствие", m.avgProductPct != null ? m.avgProductPct + "%" : "—", m.avgPilotPct != null ? `${m.avgProductPct ?? "—"}% · пилот ${m.avgPilotPct}% · из 100` : (m.avgProductPct != null ? `${m.avgProductPct}% · из 100` : "—"), "")}
    </div>
    <div class="grid grid-4" style="margin-bottom:1rem">
      ${metricCardDrill("Неполные (выбранные блоки)", m.passportIncomplete ?? m.incomplete, dashCountSub(m.passportIncomplete ?? m.incomplete, n, "по активным критериям"), dashDrill(buildDealsReportSpec({}, { type: "passportBlocks", value: (passportBlockSelection || []).join("|") })))}
      ${metricCardDrill("Флаги риска", m.riskFlags, dashCountSub(m.riskFlags, n, "критичные"), dashDrill(buildDealsReportSpec({}, { type: "risk" })))}
      ${metricCardDrill("Ср. лояльность", m.avgLoyalty != null ? m.avgLoyalty + " / 5" : "—", m.highLoyalty ? dashCountSub(m.highLoyalty, n, "высокая (≥4)") : dashCountSub(0, n, "оценка в паспорте"), dashDrill(buildDealsReportSpec({ score__from: "1" })))}
      ${metricCardDrill("Наблюдение / Отказ", watchDrop, dashCountSub(watchDrop, n), dashDrill(buildDealsReportSpec({ category: ["Наблюдение", "Отказ"] })))}
    </div>
    <div class="grid grid-4" style="margin-bottom:1rem">
      ${metricCardDrill("Средний балл", m.avgScore ?? "—", m.avgScore != null ? `${m.avgScore} баллов · из 100 · по ${n} сделкам` : dashCountSub(0, n, "по сделкам в срезе"), dashDrill(buildDealsReportSpec({ score__from: "1" })))}
      ${metricCardDrill("Сильные коммиты", m.strongCommits || 0, dashCountSub(m.strongCommits || 0, n, "протокол / LOI / гарантия / контракт"), dashDrill(buildDealsReportSpec({}, { type: "strongCommits" })))}
      ${metricCardDrill("Доля горячих", n ? Math.round((m.hotShare || 0) * 100) + "%" : "—", dashCountSub(m.counts["Горячая"] || 0, n), dashDrill(buildDealsReportSpec({ category: ["Горячая"] })))}
      ${metricCardDrill("Все 5 блоков", m.passportAllBlocksPct != null ? Math.round(m.passportAllBlocksPct * 100) + "%" : "—", dashCountSub(passportAllCount, n, "полный паспорт"), dashDrill(buildDealsReportSpec({}, { type: "passportBlocks", value: PASSPORT_BLOCKS.map(b => b.id).join("|") })))}
    </div>

    ${typeof dashWidgetCard === "function" ? dashWidgetCard("task-metrics", "Задачи", renderDashboardWidgetBody("task-metrics", m), "task-metrics-card") : ""}

    ${typeof dashWidgetCard === "function" ? dashWidgetCard("passport-completeness", `Полнота паспортов · ${m.passportStats?.pct != null ? Math.round(m.passportStats.pct * 100) : (m.passportCompleteness != null ? Math.round(m.passportCompleteness * 100) : 0)}%`, renderDashboardWidgetBody("passport-completeness", m), "passport-panel") : (typeof renderPassportCompletenessPanel === "function" ? renderPassportCompletenessPanel(m, n) : "")}
    ${typeof dashWidgetCard === "function" ? dashWidgetCard("top-risks", "Топ рисков в срезе", renderDashboardWidgetBody("top-risks", m)) : (typeof renderTopRisksPanel === "function" ? renderTopRisksPanel(m) : "")}
    ${typeof dashWidgetCard === "function" ? dashWidgetCard("loss-reasons", "Причины отказа", renderDashboardWidgetBody("loss-reasons", m)) : ""}
    <div class="grid grid-2" style="margin-bottom:1.5rem">
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("success-realized", "Успешно реализовано", renderDashboardWidgetBody("success-realized", m), "success-realized-card") : ""}
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("success-shipped", "Отгружен", renderDashboardWidgetBody("success-shipped", m), "success-shipped-card") : ""}
    </div>
    ${typeof dashWidgetCard === "function" ? dashWidgetCard("manager-passport", "Менеджеры: полнота паспортов", renderDashboardWidgetBody("manager-passport", m)) : (typeof renderManagerPassportPanel === "function" ? renderManagerPassportPanel(m) : "")}

    ${typeof dashWidgetCard === "function" ? dashWidgetCard("dynamics", "Динамика пайплайна", renderDashboardWidgetBody("dynamics", m), "dynamics-card") : `<div class="card dynamics-card" style="margin-bottom:1.5rem"><div class="card-header">Динамика пайплайна</div><div class="card-body" id="dynamics-block"></div></div>`}

    ${typeof dashWidgetSection === "function" ? dashWidgetSection("category-bars", "Распределение по категориям", renderDashboardWidgetBody("category-bars", m)) : `<div class="section-title">Распределение по категориям</div><div class="category-bars" style="margin-bottom:1.5rem">${renderDashboardWidgetBody("category-bars", m)}</div>`}

    <div class="grid grid-2" style="margin-bottom:1.5rem">
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("budget-period", "Сроки бюджета", renderDashboardWidgetBody("budget-period", m)) : ""}
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("commit-funnel", "Воронка коммитов", renderDashboardWidgetBody("commit-funnel", m)) : ""}
    </div>

    <div class="grid grid-2" style="margin-bottom:1.5rem">
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("owners-table", "По владельцам (менеджерам)", renderDashboardWidgetBody("owners-table", m)) : ""}
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("stage-funnel", "Воронка по стадиям (amoCRM)", renderDashboardWidgetBody("stage-funnel", m)) : ""}
    </div>

    <div class="grid grid-2" style="margin-bottom:1.5rem">
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("budget-status", "Статус бюджета", renderDashboardWidgetBody("budget-status", m)) : ""}
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("segments", "Что ищут клиенты (сегменты)", renderDashboardWidgetBody("segments", m)) : ""}
    </div>

    <div class="grid grid-2" style="margin-bottom:1.5rem">
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("competitors", `Конкурентный ландшафт${compDealCount ? ` <span class="muted dash-drill-row" style="font-weight:400;cursor:pointer" ${dashDrill(buildDealsReportSpec({}, { type: "hasCompetitors" }))} title="Открыть все сделки с конкурентами">(${escapeHtml(compDealLabel)})</span>` : ""}`, renderDashboardWidgetBody("competitors", m)) : ""}
      ${typeof dashWidgetCard === "function" ? dashWidgetCard("replacement-landscape", `Кого заменяем${replDealCount ? ` <span class="muted" style="font-weight:400">(${escapeHtml(replDealLabel)})</span>` : ""}`, renderDashboardWidgetBody("replacement-landscape", m)) : ""}
    </div>

    ${typeof dashWidgetCard === "function" ? dashWidgetCard("competitor-status", "Статусы по конкурентам", renderDashboardWidgetBody("competitor-status", m)) : ""}

    ${typeof dashWidgetCard === "function" ? dashWidgetCard("budget-matrix", "Матрица: срок бюджета × статус", renderDashboardWidgetBody("budget-matrix", m)) : ""}
    ${typeof dashWidgetCard === "function" ? dashWidgetCard("top-deals", "Top-10 сделок по взвешенному прогнозу", renderDashboardWidgetBody("top-deals", m)) : ""}
    ${typeof dashWidgetCard === "function" ? dashWidgetCard("attention", "⚠ Требуют внимания", renderDashboardWidgetBody("attention", m)) : ((m.attention || []).length ? `<div class="card" style="margin-bottom:1.5rem"><div class="card-header">⚠ Требуют внимания</div><div class="card-body">${renderDashboardWidgetBody("attention", m)}</div></div>` : "")}

    <div class="note">${window.ITMEN_API?.backend === "pocketbase"
      ? "Данные в PocketBase · автосохранение при изменениях."
      : window.ITMEN_API?.backend === "gas"
      ? "Данные в Google Таблице · автосохранение при изменениях."
      : window.ITMEN_API?.enabled
        ? "Данные на сервере · автосохранение при изменениях."
        : "Данные сохраняются локально в браузере."} Каталог вендоров: ${catalogCountLabel?.() ?? "—"} позиций.</div>`;

  if (typeof bindDynamicsEvents === "function") bindDynamicsEvents();
  if (typeof scheduleDynamicsLoad === "function") scheduleDynamicsLoad();
  if (typeof scheduleTaskDashboardLoad === "function") scheduleTaskDashboardLoad();
  mountDashboardFilterPanelsIfOpen();
  if (typeof bindDashboardWidgetFilterEvents === "function") bindDashboardWidgetFilterEvents(el);
  if (typeof mountOpenDashboardWidgetFilters === "function") mountOpenDashboardWidgetFilters();
}

function renderScoring() {
  const el = document.getElementById("page-scoring");
  if (!el) return;
  const admin = typeof isAdmin === "function" && isAdmin();
  const items = getMergedScoringItems(state.scoring);
  if (admin) {
    el.innerHTML = `
      <div class="card"><div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3 style="margin:0">Модель скоринга</h3>
          <button type="button" class="btn btn-primary btn-sm" id="scoring-save">Сохранить изменения</button>
        </div>
        <p class="muted">Редактирование критериев, весов, столбцов и шкал (только админ)</p>
        <div class="table-wrap"><table class="rubric-table scoring-edit-table">
          <thead><tr><th>Критерий</th><th>Вопрос</th><th>Кол.</th><th>Вес %</th><th>5</th><th>4</th><th>3</th><th>2</th><th>1</th><th>0</th><th>Ответственный</th></tr></thead>
          <tbody>${items.map((s, i) => {
            const scale = buildScoreScale(s);
            return `<tr data-idx="${i}" data-key="${escapeHtml(s.key)}">
              <td><textarea class="sc-name sc-expand" rows="2">${escapeHtml(s.name)}</textarea></td>
              <td><textarea class="sc-question sc-expand" rows="3">${escapeHtml(s.question || "")}</textarea></td>
              <td><textarea class="sc-col sc-expand" rows="2">${escapeHtml(s.col || "")}</textarea></td>
              <td><input type="number" class="sc-weight" value="${Math.round((s.weight || 0) * 100)}" min="0" max="100" style="width:4rem"></td>
              <td><textarea class="sc-s5 sc-expand" rows="3">${escapeHtml(scale[5] || "")}</textarea></td>
              <td><textarea class="sc-s4 sc-expand" rows="3">${escapeHtml(scale[4] || "")}</textarea></td>
              <td><textarea class="sc-s3 sc-expand" rows="3">${escapeHtml(scale[3] || "")}</textarea></td>
              <td><textarea class="sc-s2 sc-expand" rows="3">${escapeHtml(scale[2] || "")}</textarea></td>
              <td><textarea class="sc-s1 sc-expand" rows="3">${escapeHtml(scale[1] || "")}</textarea></td>
              <td><textarea class="sc-s0 sc-expand" rows="3">${escapeHtml(s.s0 || "")}</textarea></td>
              <td><textarea class="sc-owner sc-expand" rows="2">${escapeHtml(s.owner || "")}</textarea></td>
            </tr>`;
          }).join("")}
          </tbody>
        </table></div>
      </div></div>
      <div class="section-title">Пороги категорий</div>
      <div class="grid grid-4">
        ${[["Горячая", "≥ 80", "badge-hot"], ["Тёплая", "≥ 60", "badge-warm"], ["Наблюдение", "≥ 40", "badge-watch"], ["Отказ", "< 40", "badge-drop"]]
          .map(([n, t, c]) => `<div class="metric-card"><span class="badge ${c}">${n}</span><div class="value" style="font-size:1rem;margin-top:.5rem">${t}</div></div>`).join("")}
      </div>`;
    document.getElementById("scoring-save").onclick = saveScoringFromTable;
    return;
  }
  const legendBlocks = items.map(s => {
    const scale = buildScoreScale(s);
    return `<div class="score-legend-block">
      <h4>${escapeHtml(s.name)} <span class="weight-tag">${Math.round(s.weight * 100)}%</span></h4>
      <p class="legend-question">${escapeHtml(s.question || "")}</p>
      <div class="score-legend-grid">
        ${[5, 4, 3, 2, 1].map(n => `<div class="legend-level"><span class="lvl">${n}</span><span>${escapeHtml(scale[n] || "—")}</span></div>`).join("")}
        <div class="legend-level muted"><span class="lvl">0</span><span>${escapeHtml(s.s0 || "—")}</span></div>
      </div>
    </div>`;
  }).join("");

  el.innerHTML = `
    <div class="card"><div class="table-wrap"><table class="rubric-table">
      <thead><tr><th>Критерий</th><th>Вопрос</th><th>Кол.</th><th>Вес</th><th>5</th><th>4</th><th>3</th><th>2</th><th>1</th><th>0</th><th>Ответственный</th></tr></thead>
      <tbody>${items.map(s => {
        const scale = buildScoreScale(s);
        return `<tr>
        <td>${escapeHtml(s.name)}</td>
        <td class="muted" style="max-width:220px;font-size:.75rem">${escapeHtml(s.question || "")}</td>
        <td>${s.col}</td><td class="weight">${Math.round(s.weight * 100)}%</td>
        <td>${escapeHtml(scale[5])}</td><td>${escapeHtml(scale[4])}</td><td>${escapeHtml(scale[3])}</td>
        <td>${escapeHtml(scale[2])}</td><td>${escapeHtml(scale[1])}</td><td>${escapeHtml(s.s0)}</td>
        <td>${escapeHtml(s.owner)}</td></tr>`;
      }).join("")}
      </tbody>
    </table></div></div>
    <div class="section-title">Легенда шкалы 1–5 (используется в паспорте сделки)</div>
    <div class="score-legend-panel">${legendBlocks}</div>
    <div class="section-title">Пороги категорий</div>
    <div class="grid grid-4">
      ${[["Горячая", "≥ 80", "badge-hot"], ["Тёплая", "≥ 60", "badge-warm"], ["Наблюдение", "≥ 40", "badge-watch"], ["Отказ", "< 40", "badge-drop"]]
        .map(([n, t, c]) => `<div class="metric-card"><span class="badge ${c}">${n}</span><div class="value" style="font-size:1rem;margin-top:.5rem">${t}</div></div>`).join("")}
    </div>`;
}

async function saveScoringFromTable() {
  const rows = [...document.querySelectorAll(".scoring-edit-table tbody tr")];
  const val = sel => tr.querySelector(sel)?.value?.trim() || "";
  const items = rows.map(tr => ({
    key: tr.dataset.key,
    name: val(".sc-name"),
    question: val(".sc-question"),
    col: val(".sc-col") || "—",
    weight: (Number(tr.querySelector(".sc-weight")?.value) || 0) / 100,
    owner: val(".sc-owner") || "—",
    s5: val(".sc-s5"),
    s4: val(".sc-s4"),
    s3: val(".sc-s3"),
    s2: val(".sc-s2"),
    s1: val(".sc-s1"),
    s0: val(".sc-s0"),
  }));
  try {
    const res = await apiSaveScoring(items);
    state.scoring = (res.items || []).map(({ key, sortOrder, manualOnly, ...rest }) => rest);
    persistStateCache(state);
    showToast("Модель скоринга сохранена");
    renderScoring();
  } catch (e) {
    alert(e.message);
  }
}

function previewDealId() {
  return "D-" + String(state.nextId || 1).padStart(3, "0");
}

function consumeDealId() {
  const id = previewDealId();
  state.nextId = (state.nextId || 1) + 1;
  return id;
}

function hint(text) {
  return `<span class="field-hint" title="${escapeHtml(text)}">ⓘ</span>`;
}

function commitSelect(id, value) {
  const statuses = window.ITMEN_CONFIG?.commitStatuses || [];
  const v = normalizeCommitStatus(value);
  return `<select id="${id}" onchange="updateCommitHint()">
    ${statuses.map(c => `<option value="${c.id}" ${c.id === v ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
  </select>
  <div class="commit-hint" id="commit-hint">${escapeHtml(statuses.find(c => c.id === v)?.desc || "")}</div>`;
}

function typeSelect(id, types, value) {
  return `<select id="${id}">
    ${types.map(t => `<option value="${t.id}" ${t.id === value ? "selected" : ""}>${escapeHtml(t.label)}</option>`).join("")}
  </select>`;
}

function collectRiskTypesFromForm() {
  return [...document.querySelectorAll(".risk-type-cb:checked")].map(x => x.value);
}

function renderRiskCheckboxes(selected) {
  const set = new Set(selected || []);
  const types = window.ITMEN_CONFIG?.riskTypes || [];
  return `<div class="checkbox-group risk-checkbox-group" id="risk-types-group">${types.map(t =>
    `<label class="checkbox-label"><input type="checkbox" class="risk-type-cb" value="${t.id}" ${set.has(t.id) ? "checked" : ""}> ${escapeHtml(t.label)}</label>`
  ).join("")}</div>`;
}

function refreshModelScores() {
  const keepLoyalty = document.getElementById("s-loyalty")?.value;
  const draft = {
    ...collectDealDraft(),
    techResearch: collectTechResearch(),
  };
  modalSuggestion = suggestScores(draft);
  applyModelScores(true);
  if (keepLoyalty != null) {
    const el = document.getElementById("s-loyalty");
    if (el) el.value = keepLoyalty;
  }
  showToast("Скоринг пересчитан по данным формы");
}

function collectDealDraft() {
  return {
    stage: val("f-stage"),
    budgetStatus: val("f-budgetStatus"),
    commitStatus: val("f-commitStatus"),
    amount: +val("f-amount") || 0,
    expectedBudget: +val("f-expectedBudget") || 0,
    pains: val("f-pains"),
    riskTypes: collectRiskTypesFromForm(),
    riskType: collectRiskTypesFromForm()[0] || "none",
  };
}

function renderScoreSection(deal, suggestion, opts = {}) {
  const compact = opts.compact === true;
  const items = getMergedScoringItems(state.scoring);
  const manualKeys = new Set(window.ITMEN_CONFIG?.manualScoreKeys || ["loyalty"]);

  const cards = items.map(c => {
    if (c.key === "manualProb") {
      const pct = typeof manualProbDisplayPct === "function" ? manualProbDisplayPct(deal.manualProb) : null;
      const derived = typeof manualProbToScore === "function" ? manualProbToScore(deal.manualProb) : 0;
      const scale = buildScoreScale(c);
      const pctLabel = pct != null && pct > 0 ? `${pct}%` : "не задана";
      if (compact) {
        return `<div class="score-card score-card-compact manual-score" data-score-key="manualProb">
          <div class="score-card-head">
            <strong class="score-card-title">${escapeHtml(c.name)}</strong>
            <div class="score-card-tools">
              <span class="weight-tag">${Math.round(c.weight * 100)}%</span>
              <span class="badge badge-warn">ручная</span>
            </div>
          </div>
          <div class="score-card-row">
            <span class="score-suggest muted">В паспорте: <strong>${escapeHtml(pctLabel)}</strong> → балл <strong>${derived}</strong></span>
          </div>
        </div>`;
      }
      return `<div class="score-card manual-score">
        <div class="score-card-head">
          <strong>${escapeHtml(c.name)}</strong>
          <span class="weight-tag">${Math.round(c.weight * 100)}%</span>
          <span class="badge badge-warn">ручная</span>
        </div>
        <p class="legend-question">${escapeHtml(c.question || "")}</p>
        <p class="score-suggest">Задаётся в поле «Вероятность, %» в паспорте: <strong>${escapeHtml(pctLabel)}</strong> → в скоринг как <strong>${derived}</strong> из 5</p>
        <div class="score-legend-inline">
          ${[5, 4, 3, 2, 1].map(n =>
            `<div class="legend-row"><span class="lvl">${n}</span><span>${escapeHtml(scale[n] || "—")}</span></div>`
          ).join("")}
          <div class="legend-row muted"><span class="lvl">0</span><span>${escapeHtml(c.s0 || "—")}</span></div>
        </div>
      </div>`;
    }

    const cur = deal.scores?.[c.key] ?? 0;
    const sug = suggestion.scores[c.key] ?? 0;
    const isManual = manualKeys.has(c.key) || c.manualOnly;
    const reason = deal.scoreReasons?.[c.key] || suggestion.reasons[c.key] || "";
    const overridden = deal.scoresOverridden?.[c.key];
    const hist = (deal.scoreHistory || []).filter(h => h.scores?.[c.key] != null).slice(-3);
    const histHtml = hist.length ? `<div class="score-history">${hist.map(h =>
      `<div class="hist-row"><span>${h.date}</span><span>${h.source === "model" ? "модель" : h.source === "import" ? "импорт" : "ручное"}</span><span>${h.scores[c.key]}</span></div>`
    ).join("")}</div>` : "";
    const suggestHtml = isManual
      ? `<span class="score-suggest muted">Только ручная</span>`
      : `<span class="score-suggest">Модель: <strong>${sug}</strong>${overridden ? ' · <span class="badge badge-warn">изм.</span>' : ""}</span>`;

    if (compact) {
      const helpText = c.question || c.name || "";
      return `<div class="score-card score-card-compact ${overridden ? "overridden" : ""} ${isManual ? "manual-score" : ""}" data-score-key="${escapeHtml(c.key)}">
        <div class="score-card-head">
          <strong class="score-card-title">${escapeHtml(c.name)}</strong>
          <div class="score-card-tools">
            ${helpText ? `<button type="button" class="score-icon-btn score-help-btn" data-help="${escapeHtml(helpText)}" title="Описание">?</button>` : ""}
            <button type="button" class="btn btn-sm score-rules-btn" data-key="${escapeHtml(c.key)}">Правила</button>
            <span class="weight-tag">${Math.round(c.weight * 100)}%</span>
            ${isManual ? '<span class="badge badge-warn">ручная</span>' : ""}
          </div>
        </div>
        <div class="score-card-row">
          ${suggestHtml}
          <select id="s-${c.key}" onchange="markScoreOverride('${c.key}')">
            ${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${+cur === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        ${histHtml}
      </div>`;
    }

    const scale = buildScoreScale(c);
    return `<div class="score-card ${overridden ? "overridden" : ""} ${isManual ? "manual-score" : ""}">
      <div class="score-card-head">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="weight-tag">${Math.round(c.weight * 100)}%</span>
        ${isManual ? '<span class="badge badge-warn">ручная</span>' : ""}
      </div>
      <p class="legend-question">${escapeHtml(c.question || "")}</p>
      ${suggestHtml}
      <select id="s-${c.key}" onchange="markScoreOverride('${c.key}')">
        ${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${+cur === n ? "selected" : ""}>${n}</option>`).join("")}
      </select>
      <div class="score-reason">${escapeHtml(reason)}</div>
      <div class="score-legend-inline">
        ${[5, 4, 3, 2, 1].map(n =>
          `<div class="legend-row"><span class="lvl">${n}</span><span>${escapeHtml(scale[n] || "—")}</span></div>`
        ).join("")}
        <div class="legend-row muted"><span class="lvl">0</span><span>${escapeHtml(c.s0 || "—")}</span></div>
      </div>
      ${histHtml}
    </div>`;
  }).join("");

  const panelClass = compact ? "scores-panel scores-panel-compact" : "scores-panel";
  return `
    <div class="score-toolbar">
      <button type="button" class="btn btn-sm" onclick="applyModelScores()">↺ Применить оценку модели</button>
      <button type="button" class="btn btn-sm" onclick="refreshModelScores()">⟳ Пересчитать по форме</button>
      ${compact ? "" : `<span class="muted">Лояльность и вероятность — только вручную. Коммит считается из «Статус коммита».</span>`}
    </div>
    <div class="${panelClass}">${cards}</div>`;
}

function renderScoreRulesHtml(c) {
  const scale = buildScoreScale(c);
  return `<div class="score-rules-modal-body">
    <p class="muted" style="margin-bottom:.75rem">${escapeHtml(c.question || c.name || "")}</p>
    ${[5, 4, 3, 2, 1].map(n =>
      `<div class="legend-row"><span class="lvl">${n}</span><span>${escapeHtml(scale[n] || "—")}</span></div>`
    ).join("")}
    <div class="legend-row muted"><span class="lvl">0</span><span>${escapeHtml(c.s0 || "—")}</span></div>
  </div>`;
}

function closeScoreHelpPopover() {
  document.getElementById("score-help-popover")?.remove();
}

function showScoreHelpPopover(anchor, text) {
  closeScoreHelpPopover();
  if (!text) return;
  const pop = document.createElement("div");
  pop.id = "score-help-popover";
  pop.className = "score-help-popover";
  pop.textContent = text;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 8)}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  setTimeout(() => {
    document.addEventListener("click", closeScoreHelpPopover, { once: true });
  }, 0);
}

function showScoreRulesModal(key) {
  const items = getMergedScoringItems(state.scoring);
  const c = items.find(x => x.key === key);
  if (!c) return;
  let overlay = document.getElementById("score-rules-modal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "score-rules-modal";
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal mini-modal">
      <div class="modal-header modal-header-sticky">
        <h3>Правила: ${escapeHtml(c.name)}</h3>
        <button type="button" class="btn btn-sm" onclick="closeModal('score-rules-modal')" aria-label="Закрыть">✕</button>
      </div>
      <div class="modal-body">${renderScoreRulesHtml(c)}</div>
    </div>`;
  overlay.classList.add("open");
  overlay.onclick = e => { if (e.target === overlay) closeModal("score-rules-modal"); };
}

function bindScoreSectionUi(root) {
  const scope = root || document;
  scope.querySelectorAll(".score-help-btn").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      showScoreHelpPopover(btn, btn.dataset.help || "");
    };
  });
  scope.querySelectorAll(".score-rules-btn").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      showScoreRulesModal(btn.dataset.key);
    };
  });
}

function ensureArchitectureLoaded() {
  if (window.ITMEN_ARCHITECTURE) return Promise.resolve();
  if (window._archLoadPromise) return window._archLoadPromise;
  window._archLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "js/architecture-data.js";
    s.async = true;
    s.onload = () => {
      window._itmenCatalogCache = null;
      resolve();
    };
    s.onerror = () => reject(new Error("Не удалось загрузить каталог вендоров"));
    document.head.appendChild(s);
  });
  return window._archLoadPromise;
}

function renderDealModalSkeleton() {
  return `<div class="deal-modal-loader" aria-live="polite">
    <div class="deal-modal-spinner"></div>
    <p>Загрузка паспорта сделки…</p>
    <div class="app-skeleton" style="margin-top:1rem">
      <div class="sk-line sk-wide"></div>
      <div class="sk-line"></div>
      <div class="sk-line"></div>
      <div class="sk-grid">${"<div class=\"sk-card\"></div>".repeat(3)}</div>
    </div>
  </div>`;
}

function bindPassportMoneyInputs(root) {
  if (!root || typeof formatMoneyInput !== "function" || typeof parseMoneyInput !== "function") return;
  root.querySelectorAll(".money-input").forEach(inp => {
    if (inp.dataset.moneyBound) return;
    inp.dataset.moneyBound = "1";
    inp.addEventListener("blur", () => {
      inp.value = formatMoneyInput(parseMoneyInput(inp.value));
    });
    inp.addEventListener("focus", () => {
      const n = parseMoneyInput(inp.value);
      inp.value = n ? String(n) : "";
    });
  });
}

function parseIndustryValues(raw) {
  return String(raw || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

function formatIndustryValues(arr) {
  return (arr || []).map(s => String(s).trim()).filter(Boolean).join("; ");
}

function readIndustryField(fallback) {
  const wrap = document.querySelector(".deal-industry-ms");
  if (!wrap) {
    const el = document.getElementById("f-industry");
    return el ? el.value : (fallback || "");
  }
  const checked = [...wrap.querySelectorAll(".deal-industry-cb:checked")].map(cb => cb.value);
  return formatIndustryValues(checked);
}

function renderIndustryMultiselect(options, selectedRaw) {
  const selected = new Set(parseIndustryValues(selectedRaw));
  const label = selected.size ? `${selected.size} выбр.` : "Не выбрано";
  const checkboxes = (options || []).filter(o => o && o !== "—").map(o =>
    `<label class="deals-ms-opt">
      <input type="checkbox" class="deals-ms-cb deal-industry-cb" value="${escapeHtml(o)}"${selected.has(o) ? " checked" : ""}>
      <span>${escapeHtml(o)}</span>
    </label>`
  ).join("");
  return `<div class="deals-ms-filter deal-industry-ms" data-col="industry">
    <button type="button" class="deals-ms-toggle deal-industry-toggle">${escapeHtml(label)} ▾</button>
    <div class="deals-ms-panel">
      <div class="deals-ms-actions">
        <button type="button" class="deals-ms-clear deal-industry-clear">Сбросить</button>
      </div>
      <div class="deals-ms-list">${checkboxes || `<p class="muted">Нет отраслей в справочнике</p>`}</div>
    </div>
  </div>`;
}

function bindIndustryMultiselect(root) {
  const wrap = root?.querySelector(".deal-industry-ms");
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = "1";
  const toggle = wrap.querySelector(".deal-industry-toggle");
  const updateLabel = () => {
    const n = wrap.querySelectorAll(".deal-industry-cb:checked").length;
    if (toggle) toggle.textContent = (n ? `${n} выбр.` : "Не выбрано") + " ▾";
  };
  toggle?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll(".deal-industry-ms.open").forEach(el => {
      if (el !== wrap) el.classList.remove("open");
    });
    wrap.classList.toggle("open");
  });
  wrap.querySelector(".deal-industry-clear")?.addEventListener("click", e => {
    e.preventDefault();
    wrap.querySelectorAll(".deal-industry-cb").forEach(cb => { cb.checked = false; });
    updateLabel();
  });
  wrap.querySelectorAll(".deal-industry-cb").forEach(cb => cb.addEventListener("change", updateLabel));
}

function bindPresaleOwnerAutoTab(root) {
  const sel = root?.querySelector("#f-passport-presale-owner");
  if (!sel || sel.dataset.presaleTabBound) return;
  sel.dataset.presaleTabBound = "1";
  sel.addEventListener("change", () => {
    if (!sel.value.trim()) return;
    if (typeof switchDealPageRightTab === "function") switchDealPageRightTab("presale-events");
  });
}

function bindDealPassportExtras(root) {
  bindPassportMoneyInputs(root);
  bindIndustryMultiselect(root);
  bindPresaleOwnerAutoTab(root);
  if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(root);
}

function buildDealPassportHtml(d, editable, suggestion, opts = {}) {
  const L = state.lists;
  const includeScoring = opts.includeScoring !== false;
  return `
    <div class="form-section">
      <div class="form-section-title">Основное</div>
      <div class="form-grid deal-passport-grid">
        <div>
          <label>ID сделки ${hint("Генерируется автоматически")}</label>
          <input id="f-id" value="${escapeHtml(d.id)}" readonly class="readonly">
        </div>
        <div><label>Клиент</label><input id="f-customer" value="${escapeHtml(d.customer)}" placeholder="Название компании"></div>
        <div><label>Отрасль</label>${renderIndustryMultiselect(L.industries, d.industry)}</div>
        <div><label>Владелец</label>${select("f-owner", ownerSelectOptions(d.owner), d.owner || ownerSelectOptions()[0] || "")}</div>
        ${(() => {
          const presale = typeof normalizePresaleBlock === "function" ? normalizePresaleBlock(d?.presale, d) : (d?.presale || {});
          const owners = state?.lists?.presale_owners || (typeof getPresaleStaffNames === "function" ? getPresaleStaffNames() : []);
          const cur = presale.owner || (typeof inferPresaleOwnerFromDeal === "function" ? inferPresaleOwnerFromDeal(d) : "");
          return `<div><label>Отв. пре-сейл</label>${select("f-passport-presale-owner", ["", ...owners], cur)}</div>`;
        })()}
        <div><label>Стадия</label>${select("f-stage", (typeof isAdmin === "function" && isAdmin())
          ? pipelineStageOptions()
          : (typeof managerSelectableStageOptions === "function" ? managerSelectableStageOptions(d.stage) : pipelineStageOptions()), d.stage, "toggleLossReasonField()")}</div>
        <div id="loss-reason-wrap" style="display:${d.stage === "Отказ" ? "" : "none"}"><label>Причина отказа</label>${select("f-lossReason", ["", ...lossReasonOptions()], d.lossReason || "", "toggleLossDetailFields()")}</div>
        ${renderLossDetailFields(d)}
        <div><label>Ожидаемая сумма, ₽ ${hint(window.ITMEN_CONFIG?.fieldHints?.expectedAmount || "")}</label><input type="text" inputmode="numeric" class="money-input" id="f-amount" value="${formatMoneyInput(d.amount || 0)}"></div>
        <div><label>Ожидаемый бюджет, ₽ ${hint(window.ITMEN_CONFIG?.fieldHints?.expectedBudget || "")}</label><input type="text" inputmode="numeric" class="money-input" id="f-expectedBudget" value="${formatMoneyInput(d.expectedBudget || d.budgetAmount || 0)}"></div>
        <div><label>Партнёр</label>${typeof renderPartnerPickerHtml === "function"
          ? renderPartnerPickerHtml("f-partner", d.partner || "Нет партнёра", { emptyLabel: "Нет партнёра" })
          : select("f-partner", L.partners || ["Нет партнёра"], d.partner || "Нет партнёра")}</div>
        <div><label>Скидка партнёру, % ${hint(window.ITMEN_CONFIG?.fieldHints?.partnerDiscount || "")}</label><input type="number" step="0.1" min="0" max="100" id="f-partnerDiscount" value="${d.partnerDiscount || 0}"></div>
        <div><label>Скидка клиенту, % ${hint(window.ITMEN_CONFIG?.fieldHints?.clientDiscount || "")}</label><input type="number" step="0.1" min="0" max="100" id="f-clientDiscount" value="${d.clientDiscount || 0}"></div>
        <div><label>Вероятность, %</label><input type="number" step="1" min="0" max="100" id="f-manualProb" value="${manualProbDisplayPct(d.manualProb) ?? ""}" placeholder="0–100"></div>
        <div>
          <label>Плановый период бюджета ${hint(window.ITMEN_CONFIG?.fieldHints?.budgetPeriod || "")}</label>
          ${select("f-budgetPeriod", L.budgetPeriods || ["Не определён"], d.budgetPeriod || "")}
        </div>
        <div><label>Статус бюджета</label>${select("f-budgetStatus", L.budgetStatus, d.budgetStatus || "", "toggleBudgetPlannedDate()")}</div>
        ${renderBudgetPlannedFields(d.budgetPlannedMonth, d.budgetPlannedYear, d.budgetStatus)}
        <div><label>Статус коммита клиента</label>${commitSelect("f-commitStatus", d.commitStatus)}</div>
        <div class="full"><label>Ключевые боли</label><textarea class="auto-grow" id="f-pains" rows="1" placeholder="Что болит у клиента">${escapeHtml(d.pains)}</textarea></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Риски</div>
      <div class="form-grid">
        <div class="full">
          <label>Критические риски</label>
          <p class="muted" style="font-size:.75rem;margin-bottom:.35rem">Можно выбрать несколько</p>
          ${renderRiskCheckboxes(migrateDeal(d).riskTypes)}
        </div>
        <div class="full">
          <label>Комментарий к риску</label>
          <textarea class="auto-grow" id="f-riskComment" rows="1" placeholder="Детали риска и план митигации">${escapeHtml(d.riskComment)}</textarea>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Техническое исследование</div>
      ${renderTechSection(d.techResearch, d)}
    </div>

    ${includeScoring ? `<div class="form-section">
      <div class="form-section-title">Скоринг сделки</div>
      ${renderScoreSection(d, suggestion)}
    </div>` : ""}`;
}

function buildDealScoringHtml(d, suggestion) {
  return `<div class="form-section scoring-tab-section">
    ${renderScoreSection(d, suggestion, { compact: true })}
  </div>`;
}

function openNewDealPage(returnPage) {
  const deal = emptyDeal();
  deal._draft = true;
  state.deals.push(deal);
  editingDealIdx = state.deals.length - 1;
  if (typeof openDealPage === "function") {
    openDealPage(deal.id, returnPage || activePage || "deals");
  }
}

function dealPageLinkClick(ev) {
  if (!ev) return true;
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1) return true;
  const el = ev.currentTarget;
  const dealId = el?.dataset?.dealId || el?.dataset?.id;
  if (!dealId) return true;
  ev.preventDefault();
  const ret = el?.dataset?.return || activePage || "deals";
  if (typeof openDealPage === "function") openDealPage(dealId, ret);
  else if (typeof openDealById === "function") openDealById(dealId, ev);
  return false;
}

function openDealInNewTab(dealId) {
  if (!dealId) return;
  const url = `${location.origin}${location.pathname}#deal/${encodeURIComponent(dealId)}`;
  window.open(url, "_blank", "noopener");
}

function openDealModal(idx) {
  openDealModalAsync(idx).catch(e => {
    dealModalOpening = false;
    alert(e.message || String(e));
  });
}

async function openDealModalAsync(idx) {
  if (dealModalOpening) return;
  dealModalOpening = true;
  const token = ++dealModalOpenToken;
  dealModalTab = "passport";
  window.dealCrmCache = {};
  dealPassportHtml = "";
  setDealModalDealId("");

  const modal = document.getElementById("deal-modal");
  const modalTitle = modal?.querySelector(".modal-header h3");
  if (modalTitle) modalTitle.textContent = idx != null ? "Паспорт сделки" : "Новая сделка";
  modal?.querySelector(".modal-body")?.replaceChildren();
  modal.querySelector(".modal-body").innerHTML = renderDealModalSkeleton();
  modal.classList.add("open");
  if (typeof renderDealModalTabs === "function") renderDealModalTabs();

  try {
    await ensureArchitectureLoaded();
    if (token !== dealModalOpenToken) return;

    editingDealIdx = idx ?? null;
    let raw = idx != null ? state.deals[idx] : emptyDeal();
    if (idx != null && raw?.id && needsFullDeal(raw) && window.ITMEN_API?.enabled) {
      try {
        const full = await apiLoadDeal(raw.id);
        if (token !== dealModalOpenToken) return;
        if (full) {
          state.deals[idx] = migrateDeal(full);
          raw = state.deals[idx];
          persistStateCache(state);
        }
      } catch (e) {
        console.warn("getDeal:", e);
      }
    }
    if (token !== dealModalOpenToken) return;

    const d = migrateDeal(raw);
    modalSuggestion = suggestScores(d);
    const hasScores = Object.values(d.scores || {}).some(v => v > 0);
    if (!hasScores && modalSuggestion) {
      d.scores = { ...modalSuggestion.scores };
      d.scoreReasons = { ...modalSuggestion.reasons };
      d.scores.loyalty = d.scores.loyalty ?? 0;
      d.scoreReasons.loyalty = "Оценивается только вручную";
    }
    const isNew = idx == null;

    if (token !== dealModalOpenToken) return;

    const editable = idx == null ? true : canEditDeal(d);
    const passportHtml = buildDealPassportHtml(d, editable, modalSuggestion);

    if (token !== dealModalOpenToken) return;

    dealPassportHtml = passportHtml;
    setDealModalDealId(d.id || "");

    const activeTab = dealModalTab;
    if (activeTab === "passport") {
      modal.querySelector(".modal-body").innerHTML = passportHtml;
      toggleBudgetPlannedDate();
      toggleLossReasonField();
      bindDealPassportExtras(modal.querySelector(".modal-body"));
      applyDealModalReadOnly(editable);
      renderDealModalTabs();
      storeDealPassportHtml();
    } else {
      dealModalTab = "passport";
      renderDealModalTabs();
      if (typeof switchDealTab === "function") await switchDealTab(activeTab);
    }

    if (typeof initDealModalTabs === "function") initDealModalTabs();
    if (editable && isNew && window.ITMEN_AUTH?.user?.managerName) {
      const ownerEl = document.getElementById("f-owner");
      if (ownerEl && !ownerEl.value) ownerEl.value = window.ITMEN_AUTH.user.managerName;
    }
  } finally {
    if (token === dealModalOpenToken) dealModalOpening = false;
  }
}

function updateCommitHint() {
  const id = val("f-commitStatus");
  const c = (window.ITMEN_CONFIG?.commitStatuses || []).find(x => x.id === id);
  const el = document.getElementById("commit-hint");
  if (el && c) el.textContent = c.desc;
}

function applyModelScores(silent) {
  if (!modalSuggestion) return;
  const manualKeys = new Set(window.ITMEN_CONFIG?.manualScoreKeys || ["loyalty"]);
  const criteria = window.ITMEN_CONFIG?.scoreCriteria || [];
  criteria.forEach(c => {
    if (manualKeys.has(c.key)) return;
    const el = document.getElementById("s-" + c.key);
    if (el) el.value = modalSuggestion.scores[c.key] ?? 0;
  });
  if (!silent) showToast("Оценки модели подставлены (лояльность не менялась)");
}

function markScoreOverride(key) {
  const card = document.getElementById("s-" + key)?.closest(".score-card");
  if (card) card.classList.add("overridden");
}

function emptyDeal() {
  const defaultOwner = window.ITMEN_AUTH?.user?.managerName
    || window.ITMEN_AUTH?.user?.displayName
    || ownerSelectOptions()[0] || "";
  return {
    id: previewDealId(),
    customer: "",
    industry: "Не определена",
    owner: defaultOwner,
    stage: state.lists?.stages?.[0] || "Взят в работу",
    dealType: "Текущий пайплайн",
    amount: 0,
    expectedBudget: 0,
    partner: "Нет партнёра",
    partnerDiscount: 0,
    clientDiscount: 0,
    manualProb: 0,
    taskDue: new Date().toISOString().slice(0, 10),
    budgetPeriod: "Не определён",
    budgetStatus: "Неизвестно",
    budgetPlannedMonth: null,
    budgetPlannedYear: null,
    budgetAmount: 0,
    techResearch: typeof defaultTechResearch === "function" ? defaultTechResearch() : { classEntries: {} },
    pains: "",
    capabilities: "",
    dml: "Не определён",
    scores: { loyalty: 0, commit: 0, budget: 0, fit: 0, timing: 0, competitive: 0, access: 0, technical: 0, commercial: 0 },
    scoreReasons: {},
    scoreHistory: [],
    scoresOverridden: {},
    riskTypes: [],
    riskType: "none",
    riskComment: "",
    commitStatus: "none",
    lastUpdate: new Date().toISOString().slice(0, 10),
    amoId: null,
  };
}

function collectScoresFromForm(prevDeal) {
  const scores = {};
  const scoreReasons = { ...(prevDeal?.scoreReasons || {}) };
  const scoresOverridden = { ...(prevDeal?.scoresOverridden || {}) };
  const scoreHistory = [...(prevDeal?.scoreHistory || [])];
  const criteria = window.ITMEN_CONFIG?.scoreCriteria || [];
  const suggestion = modalSuggestion || suggestScores(prevDeal || {});
  let changed = false;
  const newScores = {};

  criteria.forEach(c => {
    if (c.key === "manualProb") return;
    const el = document.getElementById("s-" + c.key);
    const v = el ? (+el.value || 0) : (prevDeal?.scores?.[c.key] ?? 0);
    newScores[c.key] = v;
    scores[c.key] = v;
    const sug = suggestion.scores[c.key] ?? 0;
    if (el && v !== sug) scoresOverridden[c.key] = true;
    if ((prevDeal?.scores?.[c.key] ?? null) !== v) changed = true;
    if (!scoreReasons[c.key]) scoreReasons[c.key] = suggestion.reasons[c.key] || "";
  });

  if (changed) {
    scoreHistory.push({
      date: new Date().toISOString().slice(0, 10),
      source: Object.keys(scoresOverridden).length ? "manual" : "model",
      scores: { ...newScores },
    });
  }

  return { scores, scoreReasons, scoresOverridden, scoreHistory };
}

function saveDealModal() {
  const isNew = editingDealIdx == null;
  saveDealFromDomAsync({ closeModal: true, navigateToDeal: isNew }).catch(e => alert(e.message));
}

async function saveDealFromDomAsync(opts = {}) {
  const onPage = activePage === "deal" && document.getElementById("page-deal")?.querySelector(".deal-page");
  if (!onPage && typeof dealModalTab === "function" && dealModalTab() !== "passport") {
    alert("Сохранение паспорта — откройте вкладку «Паспорт»");
    return;
  }
  if (onPage && !["passport", "scoring"].includes(typeof getDealPageLeftTab === "function" ? getDealPageLeftTab() : dealPageLeftTab)) {
    alert("Сохранение паспорта — откройте вкладку «Основное» или «Скоринг»");
    return;
  }
  const prev = editingDealIdx != null ? state.deals[editingDealIdx] : null;
  const scoreData = collectScoresFromForm(prev);
  const riskTypes = collectRiskTypesFromForm();
  const dom = id => document.getElementById(id);
  const field = (id, fallback = "") => (dom(id) ? val(id) : fallback);

  let deal = {
    id: field("f-id", prev?.id || ""),
    customer: field("f-customer", prev?.customer || "").trim(),
    industry: readIndustryField(prev?.industry || ""),
    owner: field("f-owner", prev?.owner || ""),
    stage: field("f-stage", prev?.stage || ""),
    dealType: "Текущий пайплайн",
    amount: parseMoneyInput(field("f-amount", prev?.amount || 0)),
    expectedBudget: parseMoneyInput(field("f-expectedBudget", prev?.expectedBudget || 0)),
    partner: field("f-partner", prev?.partner || ""),
    partnerDiscount: +(field("f-partnerDiscount", prev?.partnerDiscount || 0)) || 0,
    clientDiscount: +(field("f-clientDiscount", prev?.clientDiscount || 0)) || 0,
    manualProb: parseManualProbInput(field("f-manualProb", manualProbDisplayPct(prev?.manualProb) ?? "")),
    taskDue: prev?.taskDue || "",
    budgetPeriod: field("f-budgetPeriod", prev?.budgetPeriod || ""),
    budgetStatus: field("f-budgetStatus", prev?.budgetStatus || ""),
    budgetPlannedMonth: (dom("f-budgetStatus") ? val("f-budgetStatus") : prev?.budgetStatus) === "Планируется согласование"
      ? (+(field("f-budgetPlannedMonth", prev?.budgetPlannedMonth || "")) || null) : null,
    budgetPlannedYear: (dom("f-budgetStatus") ? val("f-budgetStatus") : prev?.budgetStatus) === "Планируется согласование"
      ? (+(field("f-budgetPlannedYear", prev?.budgetPlannedYear || "")) || null) : null,
    commitStatus: field("f-commitStatus", prev?.commitStatus || ""),
    pains: field("f-pains", prev?.pains || ""),
    riskTypes: dom("f-riskComment") || document.querySelector('input[name="riskTypes"]') ? riskTypes : (prev?.riskTypes || []),
    riskType: (dom("f-riskComment") || document.querySelector('input[name="riskTypes"]') ? riskTypes : (prev?.riskTypes || []))[0] || "none",
    riskComment: field("f-riskComment", prev?.riskComment || ""),
    techResearch: dom("f-pains") ? collectTechResearch() : (prev?.techResearch || {}),
    updatedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString().slice(0, 10),
    ...scoreData,
    budgetAmount: parseMoneyInput(field("f-expectedBudget", prev?.expectedBudget || 0)),
    capabilities: prev?.capabilities || "",
    dml: prev?.dml || "Не определён",
    amoId: prev?.amoId || null,
    lossReason: field("f-lossReason", prev?.lossReason || ""),
    lossCompetitorKey: field("f-lossCompetitorKey", prev?.lossCompetitorKey || ""),
    lossSolutionSegments: selectedLossSolutionSegments(),
    lossItmenDiscoveryOnly: (() => {
      const v = field("f-lossItmenDiscoveryOnly", "");
      if (v === "1") return true;
      if (v === "0") return false;
      return prev?.lossItmenDiscoveryOnly ?? null;
    })(),
    lossOtherComment: field("f-lossOtherComment", prev?.lossOtherComment || ""),
  };

  if (deal.budgetStatus === "Планируется согласование" && (!deal.budgetPlannedMonth || !deal.budgetPlannedYear)) {
    alert("Укажите месяц и год планируемого согласования бюджета");
    return;
  }
  if (!deal.customer) {
    alert("Укажите клиента");
    return;
  }
  if (riskTypes.includes("other") && !deal.riskComment.trim()) {
    alert("Для риска «Другое» нужен комментарий");
    return;
  }
  const tr = deal.techResearch;
  if (tr?.seekingSegments?.includes("other") && !tr.seekingOtherLabel?.trim()) {
    alert("Укажите, что ищут в поле «Другое»");
    return;
  }

  if (deal.stage === "Отказ" && !deal.lossReason) {
    alert("Укажите причину отказа");
    return;
  }
  if (deal.stage === "Отказ" && deal.lossReason === "Выбрали конкурента" && !deal.lossCompetitorKey) {
    alert("Укажите конкурента из реестра");
    return;
  }
  if (deal.stage === "Отказ" && deal.lossReason === "Не подошло решение") {
    if (!deal.lossSolutionSegments?.length) {
      alert("Укажите, что искали клиент");
      return;
    }
    const hasDiscovery = deal.lossSolutionSegments.includes("discovery");
    const onlyDiscovery = deal.lossSolutionSegments.length === 1 && hasDiscovery;
    if (hasDiscovery && !onlyDiscovery && deal.lossItmenDiscoveryOnly == null) {
      alert("Укажите, не подошёл ли именно ITMEN как Discovery");
      return;
    }
  }
  if (typeof managerStageChangeBlocked === "function" && managerStageChangeBlocked(deal.stage, prev?.stage)) {
    alert("Стадию «Пилот Окончен» может установить только пре-сейл (успех или отказ пилота).");
    return;
  }
  if (editingDealIdx == null && window.ITMEN_API?.backend === "pocketbase" && typeof apiCheckDuplicates === "function") {
    try {
      const { items } = await apiCheckDuplicates(deal.customer, deal.id);
      if (items?.length && !confirm(`Найдены похожие сделки (${items.length}): ${items.map(x => x.id).join(", ")}. Всё равно создать?`)) return;
    } catch (_) {}
  }
  if (editingDealIdx != null && typeof canEditDeal === "function" && !canEditDeal(state.deals[editingDealIdx])) {
    alert("Нет прав на редактирование этой сделки");
    return;
  }

  if (editingDealIdx != null) state.deals[editingDealIdx] = deal;
  else {
    const placeholderId = previewDealId();
    if (window.ITMEN_API?.backend === "pocketbase") {
      deal.id = placeholderId;
    } else {
      deal.id = consumeDealId();
    }
    if (!deal.owner?.trim() && window.ITMEN_AUTH?.user?.managerName) {
      deal.owner = window.ITMEN_AUTH.user.managerName;
    }
    state.deals.push(deal);
  }

  if (opts.closeModal !== false && document.getElementById("deal-modal")?.classList.contains("open")) {
    closeModal("deal-modal");
  }

  if (window.ITMEN_API?.backend === "pocketbase") {
    try {
      const placeholderId = editingDealIdx == null ? deal.id : null;
      const res = await apiSaveDeal(deal);
        if (res.deal) {
        const migrated = migrateDeal(res.deal);
        delete migrated._draft;
        if (placeholderId && placeholderId !== migrated.id) {
          const oldIdx = state.deals.findIndex(x => x.id === placeholderId);
          if (oldIdx >= 0) state.deals[oldIdx] = migrated;
          else state.deals.push(migrated);
        } else {
          const i = state.deals.findIndex(x => x.id === migrated.id);
          if (i >= 0) state.deals[i] = migrated;
        }
        deal = migrated;
        if (res.nextId != null) state.nextId = res.nextId;
        persistStateCache(state);
      }
      const n = res?.auditRows ?? 0;
      showToast(`Сохранено (PocketBase) · аудит: ${n} строк`);
      const presaleOwner = field("f-passport-presale-owner", "");
      if (presaleOwner && deal.id && typeof apiSavePresale === "function") {
        try {
          const presaleRes = await apiSavePresale(deal.id, { owner: presaleOwner }, { syncSales: false });
          if (presaleRes?.presale) {
            const i = state.deals.findIndex(x => x.id === deal.id);
            if (i >= 0) {
              state.deals[i].presale = presaleRes.presale;
              deal = state.deals[i];
              persistStateCache(state);
            }
          }
        } catch (e) {
          console.warn("presale owner save:", e);
        }
      }
    } catch (e) {
      if (e.status === 409) {
        alert((e.message || "Конфликт версии данных") + "\n\nОбновите страницу и повторите.");
        if (typeof loadPipeline === "function") {
          try { await loadPipeline({ force: true }); } catch (_) { /* ignore */ }
        }
      } else {
        alert("Ошибка сохранения: " + e.message);
      }
      throw e;
    }
  } else {
    await saveState({ editedDealIds: [deal.id] });
  }
  invalidateMetricsCache();
    if (opts.stayOnPage && activePage === "deal") {
    editingDealIdx = state.deals.findIndex(x => x.id === deal.id);
    if (typeof updateDealPageHeaderAfterSave === "function") updateDealPageHeaderAfterSave(deal);
    else if (typeof resetDealPageDirty === "function") resetDealPageDirty();
    const tab = typeof getDealPageLeftTab === "function" ? getDealPageLeftTab() : dealPageLeftTab;
    if (tab === "passport" || tab === "scoring") {
      if (typeof switchDealPageLeftTab === "function") await switchDealPageLeftTab(tab);
    }
    if (window.dealCrmCache && deal.id) delete window.dealCrmCache[deal.id];
    if (typeof refreshDealPageRightPanel === "function") await refreshDealPageRightPanel();
  } else {
    renderAll();
    if (opts.navigateToDeal && deal.id && typeof openDealPage === "function") {
      openDealPage(deal.id);
    }
  }
}

async function saveDealModalAsync() {
  return saveDealFromDomAsync({ closeModal: true });
}

function deleteDeal(idx) {
  deleteDealAsync(idx).catch(e => alert(e.message));
}

async function deleteDealAsync(idx) {
  const deal = state.deals[idx];
  if (!deal) return;
  if (!canDeleteDeal(deal)) {
    alert("Можно удалять только свои сделки");
    return;
  }
  const admin = typeof isAdmin === "function" && isAdmin();
  let hard = false;
  if (admin) {
    if (confirm(
      `Удалить сделку ${deal.id} (${deal.customer || "без названия"}) навсегда?\n\nВсе связанные задачи, файлы и история будут удалены без возможности восстановления.`
    )) {
      hard = true;
    } else if (!confirm("Переместить сделку " + deal.id + " в архив?")) {
      return;
    }
  } else if (!confirm("Переместить сделку " + deal.id + " в архив?")) {
    return;
  }
  const deletedId = deal.id;
  if (deal._draft) {
    state.deals.splice(idx, 1);
    invalidateMetricsCache();
    if (typeof persistStateCache === "function") persistStateCache(state);
    renderAll();
    if (typeof showToast === "function") showToast("Черновик удалён");
    return;
  }
  if (window.ITMEN_API?.backend === "pocketbase") {
    try {
      const res = await apiDeleteDeal(deletedId, { hard });
      state.deals.splice(idx, 1);
      invalidateMetricsCache();
      if (typeof persistStateCache === "function") persistStateCache(state);
      renderAll();
      if (typeof showToast === "function") {
        showToast(res?.hard ? `Сделка ${deletedId} удалена навсегда` : `Сделка ${deletedId} в архиве`);
      }
      return;
    } catch (e) {
      const msg = e?.message || String(e);
      if (/404|not found|не найден/i.test(msg) && !hard) {
        state.deals.splice(idx, 1);
        invalidateMetricsCache();
        if (typeof persistStateCache === "function") persistStateCache(state);
        renderAll();
        return;
      }
      throw e;
    }
  } else {
    state.deals.splice(idx, 1);
    invalidateMetricsCache();
    await saveState({ deletedDealIds: [deletedId] });
    renderAll();
    return;
  }
}

function select(id, options, value, onchange) {
  const oc = onchange ? ` onchange="${onchange}"` : "";
  return `<select id="${id}"${oc}>${options.map(o => `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`;
}

function val(id) { return document.getElementById(id)?.value ?? ""; }
function closeModal(id) {
  if (id === "deal-modal") {
    dealModalOpenToken++;
    dealModalOpening = false;
    dealModalTab = "passport";
    dealPassportHtml = "";
    window.dealCrmCache = {};
    setDealModalDealId("");
  }
  document.getElementById(id)?.classList.remove("open");
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "itmen_pipeline_export.json";
  a.click();
  showToast("JSON экспортирован");
}

async function importJson(input) {
  if (typeof isAdmin === "function" && !isAdmin()) {
    alert("Импорт JSON доступен только администратору");
    input.value = "";
    return;
  }
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      state = migrateState(JSON.parse(e.target.result));
      await saveState({ forceFull: true });
      renderAll();
      showToast("Данные импортированы");
    } catch (_) { alert("Ошибка чтения JSON"); }
  };
  reader.readAsText(file);
  input.value = "";
}

async function reloadPipelineFromServer() {
  if (!window.ITMEN_API?.enabled) return;
  const loaded = await apiLoadPipeline({ lite: false });
  if (loaded) {
    state = migrateState(loaded);
    persistStateCache(state);
    invalidateMetricsCache();
    renderAll();
  }
}

window.reloadPipelineFromServer = reloadPipelineFromServer;
window.toggleLossReasonField = toggleLossReasonField;

function applySidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  document.getElementById("sidebar")?.classList.toggle("collapsed", collapsed);
  const btn = document.getElementById("sidebar-collapse");
  if (btn) btn.title = collapsed ? "Развернуть меню" : "Свернуть меню";
  localStorage.setItem("itmen_sidebar_collapsed", collapsed ? "1" : "0");
}

function initSidebarCollapse() {
  const collapsed = localStorage.getItem("itmen_sidebar_collapsed") === "1";
  applySidebarCollapsed(collapsed);
  document.getElementById("sidebar-collapse")?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    const next = !document.getElementById("sidebar")?.classList.contains("collapsed");
    applySidebarCollapsed(next);
  });
}

function renderNavLinks() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const admin = typeof isAdmin === "function" && isAdmin();
  nav.innerHTML = Object.entries(PAGES).map(([k, v]) => {
    if (v.adminOnly && !admin) return "";
    return `<a href="#${k}" data-page="${k}" title="${escapeHtml(v.title)}"><span class="icon">${v.icon}</span><span class="nav-label">${escapeHtml(v.title)}</span></a>`;
  }).join("");
  nav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", e => { e.preventDefault(); navigate(a.dataset.page); });
  });
  document.querySelector(`.nav a[data-page="${activePage}"]`)?.classList.add("active");
}

function applyBootWorkspaceClasses(workspaceId) {
  const ws = workspaceId || (typeof getActiveWorkspaceId === "function" ? getActiveWorkspaceId() : "sales");
  document.body.classList.toggle("workspace-presale", ws === "presale");
  document.body.classList.toggle("workspace-sales", ws === "sales");
  document.body.classList.toggle("workspace-reference", ws === "partners" || ws === "tech_partners");
  if (typeof updateNavForWorkspace === "function") updateNavForWorkspace(ws);
}

async function syncPipelineFromServerAndRefresh() {
  if (!window.ITMEN_API?.enabled) return;
  try {
    await bootstrapPipelineFromServer();
    if (typeof syncCrmOwnersList === "function") await syncCrmOwnersList();
    if (typeof syncAmoUserMap === "function") await syncAmoUserMap();
    if (typeof loadManagerAvatars === "function") await loadManagerAvatars();
    invalidateMetricsCache();
    renderAll();
    clearSyncBanner();
  } catch (e) {
    console.error(e);
    if (!state?.deals?.length) state = loadStateLocal();
    const msg = String(e.message || "ошибка");
    const isNetwork = /failed to fetch|нет связи|networkerror|load failed/i.test(msg);
    const isAuth = /требуется вход|неверн|unauthorized|401/i.test(msg);
    const cacheN = (state?.deals || []).length;
    if (window.ITMEN_API?.backend === "pocketbase") {
      const retryBtn = isAuth
        ? `<button type="button" class="btn btn-sm" id="retry-login-btn">Войти</button>`
        : `<button type="button" class="btn btn-sm" id="retry-load-btn">Повторить</button>`;
      showSyncBanner(
        `⚠ ${escapeHtml(msg)}.${cacheN ? ` Показан кэш (${cacheN} сделок).` : ""} ${retryBtn}`,
        "error"
      );
      if (isAuth) {
        document.getElementById("retry-login-btn")?.addEventListener("click", async () => {
          if (await ensureAuthSession()) {
            renderAuthTopbar();
            await syncPipelineFromServerAndRefresh();
            updateDealCountBadge();
          }
        });
      } else {
        document.getElementById("retry-load-btn")?.addEventListener("click", () => syncPipelineFromServerAndRefresh());
      }
    } else {
      showSyncBanner(
        `⚠ Не удалось обновить с сервера: ${escapeHtml(e.message || "ошибка")}. Показана локальная копия (${(state?.deals || []).length} сделок). ` +
        `<button type="button" class="btn btn-sm" id="retry-load-btn">Повторить</button> ` +
        `<button type="button" class="btn btn-sm" id="force-reload-btn">Загрузить с сервера</button>`,
        "error"
      );
      document.getElementById("retry-load-btn")?.addEventListener("click", () => syncPipelineFromServer());
      document.getElementById("force-reload-btn")?.addEventListener("click", () => forceReloadFromServer());
    }
    invalidateMetricsCache();
    renderAll();
  }
}

window.syncPipelineFromServerAndRefresh = syncPipelineFromServerAndRefresh;

document.addEventListener("DOMContentLoaded", async () => {
  renderAppSkeleton();
  initSidebarCollapse();

  renderNavLinks();

  document.getElementById("menu-toggle")?.addEventListener("click", () =>
    document.getElementById("sidebar").classList.toggle("open"));
  document.querySelectorAll(".modal-overlay").forEach(m => {
    m.addEventListener("click", e => {
      if (e.target === m && m.id !== "auth-modal") m.classList.remove("open");
    });
  });

  bindDashboardEvents();
  if (typeof bindDealsTableEvents === "function") bindDealsTableEvents();
  document.addEventListener("change", e => {
    if (e.target.classList.contains("loss-solution-seg-cb")) updateLossDiscoveryQuestionVisibility();
  });

  if (typeof showEnvironmentBanner === "function") showEnvironmentBanner();

  if (window.ITMEN_API?.backend === "pocketbase" && typeof ensureAuthSession === "function") {
    await ensureAuthSession();
    renderAuthTopbar();
    if (typeof mountWorkspaceUi === "function") mountWorkspaceUi();
    if (typeof refreshNotifications === "function") refreshNotifications();
  } else if (typeof mountWorkspaceUi === "function") {
    mountWorkspaceUi();
  }

  state = loadStateLocal();
  const boot = parseLocationHash();
  if (boot.workspace && typeof setActiveWorkspaceId === "function") {
    setActiveWorkspaceId(boot.workspace);
  }
  applyBootWorkspaceClasses(boot.workspace);
  renderAll();
  const bootSpec = boot.page === "kanban" ? boot.kanbanSpec : boot.spec;
  navigate(boot.page || "panel", bootSpec, boot.dealId);

  if (window.ITMEN_API?.enabled) {
    await syncPipelineFromServerAndRefresh();
  } else if (typeof showSetupBanner === "function") {
    showSetupBanner();
  }

  const footer = document.querySelector(".sidebar-footer");
  if (footer) footer.textContent = "Пайплайн · ui5 · Google Таблица";

  window.addEventListener("hashchange", () => {
    const p = parseLocationHash();
    if (p.workspace && typeof setActiveWorkspaceId === "function") {
      const cur = typeof getActiveWorkspaceId === "function" ? getActiveWorkspaceId() : "sales";
      if (p.workspace !== cur) {
        setActiveWorkspaceId(p.workspace);
        if (typeof onWorkspaceChanged === "function") onWorkspaceChanged(p.workspace);
      }
    }
    if (p.page === "deals" && activePage === "deals") {
      applyDealsReportSpec(p.spec);
      if (typeof syncDealsReportFiltersToUI === "function") syncDealsReportFiltersToUI();
      updateDealsTableBody(getEnrichedDeals());
      if (typeof renderDealsFilterBanner === "function") renderDealsFilterBanner();
      return;
    }
    if (p.page === "kanban" && activePage === "kanban") {
      if (typeof applyKanbanReportSpec === "function") applyKanbanReportSpec(p.kanbanSpec);
      if (typeof renderActiveKanban === "function") renderActiveKanban();
      else if (typeof renderKanban === "function") renderKanban();
      return;
    }
    if (p.page === "deal" && activePage === "deal" && p.dealId && p.dealId !== activeDealId) {
      activeDealId = p.dealId;
      if (typeof renderDealPage === "function") renderDealPage(p.dealId);
      return;
    }
    if (p.page !== activePage || (p.page === "deal" && p.dealId !== activeDealId)) {
      navigate(p.page, p.spec, p.dealId);
    }
  });
});
window.openDealModal = openDealModal;
window.openNewDealPage = openNewDealPage;
window.openDealInNewTab = openDealInNewTab;
window.dealPageLinkClick = dealPageLinkClick;
window.ownerSelectOptions = ownerSelectOptions;
window.syncCrmOwnersList = syncCrmOwnersList;
window.syncAmoUserMap = syncAmoUserMap;
window.buildDealPassportHtml = buildDealPassportHtml;
window.bindPassportMoneyInputs = bindPassportMoneyInputs;
window.bindDealPassportExtras = bindDealPassportExtras;
window.parseIndustryValues = parseIndustryValues;
window.formatIndustryValues = formatIndustryValues;
window.readIndustryField = readIndustryField;
window.buildDealScoringHtml = buildDealScoringHtml;
window.bindScoreSectionUi = bindScoreSectionUi;
window.saveDealFromDomAsync = saveDealFromDomAsync;
window.saveDealModal = saveDealModal;
window.deleteDeal = deleteDeal;
window.deleteDealAsync = deleteDealAsync;
window.closeModal = closeModal;
window.renderAll = renderAll;
window.applyModelScores = applyModelScores;
window.markScoreOverride = markScoreOverride;
window.updateCommitHint = updateCommitHint;
window.syncTechSegmentPanels = syncTechSegmentPanels;
window.addCompetitorRow = addCompetitorRow;
window.removeCompetitorRow = removeCompetitorRow;
window.toggleCompReasonFields = toggleCompReasonFields;
window.onVendorSearch = onVendorSearch;
window.hideVendorDropdownDelayed = hideVendorDropdownDelayed;
window.selectVendorOpt = selectVendorOpt;
window.clearVendorPicker = clearVendorPicker;
window.addTaskRow = addTaskRow;
window.removeTaskRow = removeTaskRow;
window.toggleBudgetPlannedDate = toggleBudgetPlannedDate;
window.refreshModelScores = refreshModelScores;
window.forceReloadFromServer = forceReloadFromServer;
window.syncPipelineFromServer = syncPipelineFromServer;
