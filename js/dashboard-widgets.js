/* Фильтры по отдельным виджетам дашборда */
let dashboardWidgetFilters = {};
let dashboardWidgetFilterOpen = null;
let dashWidgetOutsideClickHandler = null;
let dashWidgetFilterAnchorBtn = null;

const DASH_WIDGET_CFG = {
  "passport-completeness": {},
  "top-risks": {},
  "loss-reasons": { includeRejected: true, rejectedOnly: true },
  "success-realized": { includeSuccess: true, successOnly: ["Успешно реализовано"] },
  "success-shipped": { includeSuccess: true, successOnly: ["Отгружен"] },
  "manager-passport": {},
  "dynamics": {},
  "task-metrics": {},
  "category-bars": {},
  "budget-period": {},
  "commit-funnel": {},
  "owners-table": {},
  "stage-funnel": {},
  "budget-status": {},
  "segments": {},
  "competitors": {},
  "replacement-landscape": {},
  "competitor-status": {},
  "budget-matrix": {},
  "top-deals": {},
  "attention": {},
  "requirements-dashboard": {},
};

function emptyDashFilters() {
  return { owner: [], category: [], budgetPeriod: [], stage: [], partner: [], commitStatus: [], budgetStatus: [] };
}

function dashWidgetMainFilterCount(f) {
  if (!f) return 0;
  return (f.owner?.length ? 1 : 0)
    + (f.category?.length ? 1 : 0)
    + (f.budgetPeriod?.length ? 1 : 0)
    + (f.stage?.length ? 1 : 0)
    + (f.partner?.length ? 1 : 0)
    + (f.commitStatus?.length ? 1 : 0)
    + (f.budgetStatus?.length ? 1 : 0);
}

function dashWidgetFiltersActive(wf) {
  if (!wf?.amo) return false;
  return typeof amoFilterActiveCount === "function"
    && amoFilterActiveCount(wf.amo, getUnifiedFilterCols()) > 0;
}

function dashWidgetFilterCount(widgetId) {
  const wf = dashboardWidgetFilters[widgetId];
  if (!dashWidgetFiltersActive(wf)) return 0;
  return typeof amoFilterActiveCount === "function"
    ? amoFilterActiveCount(wf.amo, getUnifiedFilterCols())
    : 0;
}

function getDealsBaseSlice() {
  let deals = state?.deals || [];
  if (typeof dashboardMineOnly !== "undefined" && dashboardMineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) deals = deals.filter(d => mineFn(d));
  }
  return deals;
}

function applyDealFilters(deals, mainF, amoF, opts = {}) {
  const merged = { ...(amoF || {}) };
  const legacyKeys = ["owner", "category", "budgetPeriod", "stage", "partner", "commitStatus", "budgetStatus"];
  legacyKeys.forEach(k => {
    if (mainF?.[k]?.length && !amoFilterGetMultiselect(merged, k).length) {
      merged[k] = [...mainF[k]];
    }
  });
  let rows = deals;
  const stageSel = amoFilterGetMultiselect(merged, "stage");
  const ownerSel = amoFilterGetMultiselect(merged, "owner");
  if (!opts.skipRejectExclude && typeof applyDefaultExcludeRejected === "function") {
    rows = applyDefaultExcludeRejected(rows, stageSel);
  }
  if (!opts.skipSuccessExclude && typeof applyDefaultExcludeSuccess === "function") {
    rows = applyDefaultExcludeSuccess(rows, stageSel);
  }
  if (!opts.skipAdminExclude && typeof applyDefaultExcludeAdminOwners === "function") {
    rows = applyDefaultExcludeAdminOwners(rows, ownerSel);
  }
  if (typeof dealMatchesAmoFilters === "function") {
    const cols = typeof getUnifiedFilterCols === "function" ? getUnifiedFilterCols() : [];
    const scoringOpts = opts.scoringOpts || (typeof getDashboardScoringOpts === "function" ? getDashboardScoringOpts() : null);
    rows = rows.filter(d => dealMatchesAmoFilters(d, merged, cols, scoringOpts));
  }
  return rows;
}

function getWidgetDeals(widgetId) {
  const cfg = DASH_WIDGET_CFG[widgetId] || {};
  const wf = dashboardWidgetFilters[widgetId];
  const useWidget = dashWidgetFiltersActive(wf);
  const amoF = useWidget ? (wf?.amo || {}) : (typeof dashboardAmoFilters !== "undefined" ? dashboardAmoFilters : {});
  if (cfg.rejectedOnly) {
    let deals = (state?.deals || []).filter(d => d.stage === "Отказ");
    if (typeof dashboardMineOnly !== "undefined" && dashboardMineOnly) {
      const mineFn = typeof isDealMineForCurrentUser === "function"
        ? isDealMineForCurrentUser
        : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
      if (mineFn) deals = deals.filter(d => mineFn(d));
    }
    if (typeof dealMatchesAmoFilters === "function") {
      const cols = typeof getUnifiedFilterCols === "function" ? getUnifiedFilterCols() : [];
      const scoringOpts = typeof getDashboardScoringOpts === "function" ? getDashboardScoringOpts() : null;
      deals = deals.filter(d => dealMatchesAmoFilters(d, amoF, cols, scoringOpts));
    }
    return deals;
  }
  if (cfg.successOnly?.length) {
    let deals = (state?.deals || []).filter(d => cfg.successOnly.includes(d.stage || ""));
    if (typeof dashboardMineOnly !== "undefined" && dashboardMineOnly) {
      const mineFn = typeof isDealMineForCurrentUser === "function"
        ? isDealMineForCurrentUser
        : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
      if (mineFn) deals = deals.filter(d => mineFn(d));
    }
    if (typeof dealMatchesAmoFilters === "function") {
      const cols = typeof getUnifiedFilterCols === "function" ? getUnifiedFilterCols() : [];
      const scoringOpts = typeof getDashboardScoringOpts === "function" ? getDashboardScoringOpts() : null;
      deals = deals.filter(d => dealMatchesAmoFilters(d, amoF, cols, scoringOpts));
    }
    return deals;
  }
  let deals = getDealsBaseSlice();
  deals = applyDealFilters(deals, {}, amoF, {
    skipRejectExclude: !!cfg.includeRejected,
    skipSuccessExclude: !!cfg.includeSuccess,
  });
  return deals;
}

function intersectMultiselectFilters(baseVals, overlayVals) {
  const base = Array.isArray(baseVals) ? baseVals : (baseVals ? [String(baseVals)] : []);
  const overlay = Array.isArray(overlayVals) ? overlayVals : (overlayVals ? [String(overlayVals)] : []);
  if (!overlay.length) return base.length ? [...base] : undefined;
  if (!base.length) return [...overlay];
  const set = new Set(overlay);
  const inter = base.filter(v => set.has(v));
  return inter.length ? inter : null;
}

function mergeAmoFiltersInto(base, amoF, intersect = false) {
  const filters = { ...(base || {}) };
  if (!amoF) return filters;
  const cols = typeof getUnifiedFilterCols === "function" ? getUnifiedFilterCols() : [];
  cols.forEach(col => {
    const vals = typeof amoFilterGetMultiselect === "function" ? amoFilterGetMultiselect(amoF, col.key) : [];
    if (vals.length) {
      const merged = intersectMultiselectFilters(filters[col.key], vals);
      if (intersect) {
        if (merged === null) filters[col.key] = ["__no_match__"];
        else filters[col.key] = merged ?? (filters[col.key]?.length ? [...filters[col.key]] : [...vals]);
      } else {
        filters[col.key] = [...vals];
      }
    }
    if (amoF[`${col.key}__from`] != null && amoF[`${col.key}__from`] !== "") {
      if (!intersect || filters[`${col.key}__from`] == null || filters[`${col.key}__from`] === "") {
        filters[`${col.key}__from`] = amoF[`${col.key}__from`];
      }
    }
    if (amoF[`${col.key}__to`] != null && amoF[`${col.key}__to`] !== "") {
      if (!intersect || filters[`${col.key}__to`] == null || filters[`${col.key}__to`] === "") {
        filters[`${col.key}__to`] = amoF[`${col.key}__to`];
      }
    }
    const textVal = (amoF[col.key] || "").toString().trim();
    if (!vals.length && textVal && !(typeof amoFilterIsRange === "function" && amoFilterIsRange(col))) {
      if (!intersect || !filters[col.key]) filters[col.key] = textVal;
    }
  });
  return filters;
}

function withWidgetFilters(widgetId, spec) {
  const wf = dashboardWidgetFilters[widgetId];
  if (!dashWidgetFiltersActive(wf)) return spec;
  const filters = mergeAmoFiltersInto(spec?.filters || {}, wf.amo || {}, true);
  const mineOnly = spec?.mineOnly != null ? spec.mineOnly : (typeof dashboardMineOnly !== "undefined" ? !!dashboardMineOnly : false);
  const scoringMode = spec?.scoringMode || (typeof dashboardScoringMode !== "undefined" ? dashboardScoringMode : null);
  return buildDealsReportSpec(filters, spec?.preset, mineOnly, scoringMode, { skipTableSearch: true });
}

function buildDashDrillSpec(drillEl) {
  if (!drillEl) return buildDealsReportSpec();
  const widgetId = drillEl.closest("[data-dash-widget]")?.dataset?.dashWidget || null;
  const drillFilters = typeof pickDrillFilters === "function" ? pickDrillFilters(drillEl) : {};
  const drillPreset = drillSpecFromElement(drillEl)?.preset
    || (typeof drillSpecFromHref === "function" ? drillSpecFromHref(drillEl)?.preset : null)
    || null;
  const drillOnly = buildDealsReportSpec(drillFilters, drillPreset);
  let spec = typeof withDashboardFilters === "function" ? withDashboardFilters(drillOnly) : drillOnly;
  if (widgetId && typeof withWidgetFilters === "function") spec = withWidgetFilters(widgetId, spec);
  Object.keys(drillFilters).forEach(k => {
    const v = drillFilters[k];
    if (Array.isArray(v) && v.length) spec.filters[k] = [...v];
    else if (v != null && v !== "") spec.filters[k] = v;
  });
  const hrefSpec = typeof drillSpecFromHref === "function" ? drillSpecFromHref(drillEl) : null;
  if (hrefSpec?.filters) {
    Object.entries(hrefSpec.filters).forEach(([k, v]) => {
      if (Array.isArray(v) && v.length) spec.filters[k] = [...v];
      else if (v != null && v !== "") spec.filters[k] = v;
    });
    if (hrefSpec.preset?.type) spec.preset = hrefSpec.preset;
  }
  if (drillPreset?.type) spec.preset = drillPreset;
  return spec;
}

function openDealsReportFromDashDrill(drillEl) {
  if (!drillEl || typeof openDealsReport !== "function") return;
  let spec = typeof buildDashDrillSpec === "function" ? buildDashDrillSpec(drillEl) : null;
  const elSpec = typeof drillSpecFromElement === "function" ? drillSpecFromElement(drillEl) : null;
  const hrefSpec = typeof drillSpecFromHref === "function" ? drillSpecFromHref(drillEl) : null;
  if (!spec) spec = hrefSpec || elSpec || buildDealsReportSpec();
  if (elSpec?.preset?.type) spec.preset = { ...elSpec.preset };
  if (hrefSpec?.preset?.type) spec.preset = { ...hrefSpec.preset };
  const drillFilters = typeof pickDrillFilters === "function" ? pickDrillFilters(drillEl) : {};
  spec.filters = { ...(spec.filters || {}), ...drillFilters };
  if (typeof normalizeDealsReportSpec === "function") spec = normalizeDealsReportSpec(spec);
  openDealsReport(spec);
}

function dashWidgetCard(widgetId, title, bodyHtml, extraClass) {
  const filterN = dashWidgetFilterCount(widgetId);
  const open = dashboardWidgetFilterOpen === widgetId;
  const cls = extraClass ? ` ${extraClass}` : "";
  const openCls = open ? " dash-widget-filter-open" : "";
  const extraBadge = filterN ? `<span class="dash-widget-extra-filters-badge" title="На графике заданы дополнительные фильтры">выставлены доп. фильтры</span>` : "";
  return `<div class="card dash-widget${cls}${openCls}" data-dash-widget="${widgetId}" style="margin-bottom:1.5rem">
    <div class="card-header dash-widget-header">
      <span class="dash-widget-title">${title}${extraBadge}</span>
      <div class="amo-filter-anchor">
        <button type="button" class="btn btn-sm dash-widget-filter-btn${open ? " btn-primary" : ""}" data-widget-id="${widgetId}" title="Фильтры">🔍${filterN ? ` (${filterN})` : ""}</button>
      </div>
    </div>
    <div class="card-body dash-widget-body">${bodyHtml}</div>
  </div>`;
}

function dashWidgetSection(widgetId, title, bodyHtml) {
  const filterN = dashWidgetFilterCount(widgetId);
  const open = dashboardWidgetFilterOpen === widgetId;
  const extraBadge = filterN ? `<span class="dash-widget-extra-filters-badge" title="На графике заданы дополнительные фильтры">выставлены доп. фильтры</span>` : "";
  return `<div class="dash-widget-section dash-widget${open ? " dash-widget-filter-open" : ""}" data-dash-widget="${widgetId}" style="margin-bottom:1.5rem">
    <div class="dash-widget-section-head">
      <div class="section-title" style="margin:0">${title}${extraBadge}</div>
      <div class="amo-filter-anchor">
        <button type="button" class="btn btn-sm dash-widget-filter-btn${open ? " btn-primary" : ""}" data-widget-id="${widgetId}" title="Фильтры">🔍${filterN ? ` (${filterN})` : ""}</button>
      </div>
    </div>
    <div class="dash-widget-body">${bodyHtml}</div>
  </div>`;
}

function dashWidgetFilterCols() {
  return typeof getUnifiedFilterCols === "function" ? getUnifiedFilterCols() : [];
}

function ensureDashWidgetFilterPortal() {
  let portal = document.getElementById("dash-widget-filter-portal");
  if (!portal) {
    portal = document.createElement("div");
    portal.id = "dash-widget-filter-portal";
    document.body.appendChild(portal);
  }
  portal.className = "amo-filter-pop dash-widget-filter-pop dash-filter-pop";
  return portal;
}

function updateDashWidgetFilterBtnStates(widgetId) {
  document.querySelectorAll(".dash-widget-filter-btn").forEach(el => {
    el.classList.toggle("btn-primary", el.dataset.widgetId === widgetId);
  });
  document.querySelectorAll("[data-dash-widget]").forEach(el => {
    el.classList.toggle("dash-widget-filter-open", el.dataset.dashWidget === widgetId);
  });
}

function closeDashWidgetFilterPortal() {
  const portal = document.getElementById("dash-widget-filter-portal");
  if (portal) {
    portal.hidden = true;
    portal.style.display = "none";
    portal.innerHTML = "";
  }
  dashboardWidgetFilterOpen = null;
  dashWidgetFilterAnchorBtn = null;
  document.querySelectorAll(".dash-widget-filter-btn").forEach(el => el.classList.remove("btn-primary"));
  document.querySelectorAll(".dash-widget-filter-open").forEach(el => el.classList.remove("dash-widget-filter-open"));
  if (dashWidgetOutsideClickHandler) {
    document.removeEventListener("click", dashWidgetOutsideClickHandler, true);
    dashWidgetOutsideClickHandler = null;
  }
  if (typeof unregisterAmoFilterPop === "function") unregisterAmoFilterPop();
}

function positionDashWidgetFilterPop(widgetId, btn) {
  const pop = document.getElementById("dash-widget-filter-portal");
  btn = btn || dashWidgetFilterAnchorBtn || document.querySelector(`.dash-widget-filter-btn[data-widget-id="${widgetId}"]`);
  if (!btn || !pop) return;
  const rect = btn.getBoundingClientRect();
  const maxW = Math.min(380, window.innerWidth - 16);
  let left = rect.right - maxW;
  if (left < 8) left = Math.max(8, rect.left);
  let top = rect.bottom + 6;
  const spaceBelow = window.innerHeight - top - 12;
  if (spaceBelow < 180 && rect.top > 220) {
    top = Math.max(8, rect.top - Math.min(420, rect.top - 8));
  }
  pop.style.position = "fixed";
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.width = `${maxW}px`;
  pop.style.maxHeight = `${Math.min(420, window.innerHeight - top - 12)}px`;
  pop.style.zIndex = "5000";
}

function mountDashboardWidgetFilterPanel(widgetId) {
  const inner = document.querySelector("#dash-widget-filter-portal .dash-widget-filter-inner");
  if (!inner || typeof mountAmoFilterPanel !== "function") return;
  if (!dashboardWidgetFilters[widgetId]) {
    dashboardWidgetFilters[widgetId] = { amo: {} };
  }
  const wf = dashboardWidgetFilters[widgetId];
  mountAmoFilterPanel(inner, {
    filters: { ...(wf.amo || {}) },
    cols: dashWidgetFilterCols(),
    deals: state?.deals || [],
    onApply: draft => {
      dashboardWidgetFilters[widgetId] = { amo: { ...draft } };
      closeDashWidgetFilterPortal();
      refreshDashboardWidget(widgetId);
    },
    onReset: () => {
      delete dashboardWidgetFilters[widgetId];
    },
    onClose: () => closeDashWidgetFilterPortal(),
  });
  positionDashWidgetFilterPop(widgetId);
}

function openDashWidgetFilter(widgetId, btn) {
  closeDashWidgetFilterPortal();
  dashboardWidgetFilterOpen = widgetId;
  dashWidgetFilterAnchorBtn = btn;
  updateDashWidgetFilterBtnStates(widgetId);

  const portal = ensureDashWidgetFilterPortal();
  portal.hidden = false;
  portal.style.display = "block";
  portal.dataset.widgetId = widgetId;
  portal.innerHTML = `<div class="dash-widget-filter-inner" data-widget-id="${widgetId}"></div>`;
  mountDashboardWidgetFilterPanel(widgetId);
  positionDashWidgetFilterPop(widgetId, btn);

  if (typeof registerAmoFilterPop === "function") {
    registerAmoFilterPop(portal, btn?.closest(".amo-filter-anchor") || btn, closeDashWidgetFilterPortal);
  }
}

function mountOpenDashboardWidgetFilters() {
  if (!dashboardWidgetFilterOpen) return;
  const btn = document.querySelector(`.dash-widget-filter-btn[data-widget-id="${dashboardWidgetFilterOpen}"]`);
  if (btn) openDashWidgetFilter(dashboardWidgetFilterOpen, btn);
}

function refreshDashboardWidget(widgetId) {
  if (typeof renderDashboardWidgetBody !== "function") return;
  const deals = getWidgetDeals(widgetId);
  const m = calcMetrics(deals, typeof getDashboardScoringOpts === "function" ? getDashboardScoringOpts() : null);
  const body = renderDashboardWidgetBody(widgetId, m, deals);
  const host = document.querySelector(`[data-dash-widget="${widgetId}"] .dash-widget-body`);
  if (host) host.innerHTML = body;
  if (widgetId === "dynamics" && typeof scheduleDynamicsLoad === "function") scheduleDynamicsLoad();
  if (widgetId === "task-metrics" && typeof scheduleTaskDashboardLoad === "function") scheduleTaskDashboardLoad();
  if (widgetId === "requirements-dashboard" && typeof scheduleRequirementsDashboardLoad === "function") {
    scheduleRequirementsDashboardLoad();
  }
  if (dashboardWidgetFilterOpen === widgetId) {
    mountOpenDashboardWidgetFilters();
  }
}

function bindDashboardWidgetFilterEvents(root) {
  if (!root || root.dataset.dashWidgetBound) return;
  root.dataset.dashWidgetBound = "1";
  root.addEventListener("click", e => {
    const btn = e.target.closest(".dash-widget-filter-btn");
    if (!btn?.dataset.widgetId) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.dataset.widgetId;
    if (dashboardWidgetFilterOpen === id) {
      closeDashWidgetFilterPortal();
      return;
    }
    openDashWidgetFilter(id, btn);
  });
  window.addEventListener("scroll", () => {
    if (dashboardWidgetFilterOpen) positionDashWidgetFilterPop(dashboardWidgetFilterOpen);
  }, true);
  window.addEventListener("resize", () => {
    if (dashboardWidgetFilterOpen) positionDashWidgetFilterPop(dashboardWidgetFilterOpen);
  });
}

window.dashWidgetCard = dashWidgetCard;
window.dashWidgetSection = dashWidgetSection;
window.getWidgetDeals = getWidgetDeals;
window.withWidgetFilters = withWidgetFilters;
window.openDealsReportFromDashDrill = openDealsReportFromDashDrill;
window.mergeAmoFiltersInto = mergeAmoFiltersInto;
window.intersectMultiselectFilters = intersectMultiselectFilters;
window.buildDashDrillSpec = buildDashDrillSpec;
window.refreshDashboardWidget = refreshDashboardWidget;
window.mountOpenDashboardWidgetFilters = mountOpenDashboardWidgetFilters;
window.bindDashboardWidgetFilterEvents = bindDashboardWidgetFilterEvents;
window.applyDealFilters = applyDealFilters;
window.getDealsBaseSlice = getDealsBaseSlice;
window.closeDashWidgetFilterPortal = closeDashWidgetFilterPortal;
