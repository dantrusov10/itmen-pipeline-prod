/* UI: переключатель пространства, пре-сейл дашборд и канбан */
let presaleKanbanFilters = {};
let presaleKanbanFilterOpen = false;
let presaleKanbanMineOnly = localStorage.getItem("itmen_presale_kanban_mine") === "1";
let presaleDashboardAmoFilters = {};
let presaleDashboardFilterOpen = false;
let presaleDashPeriod = loadPresaleDashPeriod();

function loadPresaleDashPeriod() {
  try {
    const raw = JSON.parse(localStorage.getItem("itmen_presale_dash_period") || "null");
    if (raw?.from && raw?.to) return raw;
  } catch (_) { /* ignore */ }
  return defaultPresaleDashPeriod();
}

function defaultPresaleDashPeriod() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function savePresaleDashPeriod(p) {
  presaleDashPeriod = p;
  localStorage.setItem("itmen_presale_dash_period", JSON.stringify(p));
}

function presaleOwnerName(d) {
  return typeof presaleOwnerForDeal === "function"
    ? presaleOwnerForDeal(d)
    : (String(d?.presale?.owner || "").trim() || (typeof inferPresaleOwnerFromDeal === "function" ? inferPresaleOwnerFromDeal(d) : ""));
}

function collectPresaleStageTransitions(deals, from, to) {
  const t0 = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const t1 = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
  const out = [];
  (deals || []).forEach(d => {
    (d.presale?.events || []).forEach(ev => {
      if (ev.type !== "presale_stage_change" && !String(ev.body || "").includes("→")) return;
      const at = new Date(ev.at || 0).getTime();
      if (Number.isNaN(at) || at < t0 || at > t1) return;
      const fromSt = ev.meta?.from ?? (String(ev.body || "").split("→")[0] || "").trim();
      const toSt = ev.meta?.to ?? (String(ev.body || "").split("→")[1] || "").trim();
      if (!toSt) return;
      out.push({ dealId: d.id, at: ev.at, from: fromSt, to: toSt });
    });
  });
  return out;
}

function calcPresaleConversions(deals, period) {
  const transitions = collectPresaleStageTransitions(deals, period.from, period.to);
  const total = transitions.length || 0;
  const targets = [
    { key: "prep", label: "Валидные → Подготовка", to: "Подготовка к пилоту" },
    { key: "pilot", label: "Подготовка → Пилот", to: "В процессе пилота" },
    { key: "success", label: "Пилот → Успех", to: "Успех пилота" },
  ];
  return targets.map(t => {
    const entered = transitions.filter(x => x.to === t.to).length;
    const pct = total ? Math.round((entered / total) * 100) : 0;
    return { ...t, entered, total, pct };
  });
}

function renderPresaleFunnelChart(stageFunnel, maxStage, drillFn) {
  const max = maxStage || 1;
  const drill = drillFn || (typeof presaleDashDrill === "function" ? presaleDashDrill : null);
  return `<div class="funnel presale-funnel-bars">${stageFunnel.map((row, i) => {
    const pct = Math.max(2, Math.round((row.count / max) * 100));
    const conv = i > 0 && stageFunnel[i - 1].count
      ? Math.round((row.count / stageFunnel[i - 1].count) * 100)
      : null;
    const drillAttrs = row.count && drill
      ? drill(typeof buildDealsReportSpec === "function"
        ? buildDealsReportSpec({ presaleStage: [row.stage] })
        : { filters: { presaleStage: [row.stage] } })
      : "";
    const convHint = conv != null ? ` · ${conv}% от пред. этапа` : "";
    return `<div class="funnel-row presale-funnel-row dash-drill-row" ${drillAttrs} title="${row.count ? `Открыть сделки этапа${convHint}` : ""}">
      <span class="name">${escapeHtml(row.stage)}</span>
      <div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div>
      <span class="count">${row.count}</span>
    </div>`;
  }).join("")}</div>`;
}

function renderPresalePilotTimeline(deals, drillFn) {
  const drill = drillFn || (typeof presaleDashDrill === "function" ? presaleDashDrill : null);
  const rows = (deals || [])
    .map(d => ({
      id: d.id,
      customer: d.customer || "—",
      start: d.presale?.pilotStart || "",
      end: d.presale?.pilotEnd || "",
      stage: typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : "",
      owner: presaleOwnerName(d),
    }))
    .filter(r => r.start || r.end)
    .sort((a, b) => String(a.start || a.end).localeCompare(String(b.start || b.end)));
  if (!rows.length) return `<p class="muted">Нет сделок с датами пилота. Заполните даты в «Основное пре-сейл».</p>`;
  return `<div class="presale-timeline-table-wrap"><table class="presale-timeline-table">
    <thead><tr><th>Сделка</th><th>Этап</th><th>Отв. пре-сейл</th><th>Начало</th><th>Окончание</th></tr></thead>
    <tbody>${rows.map(r => {
      const drillAttrs = drill && typeof buildDealsReportSpec === "function"
        ? drill(buildDealsReportSpec({ customer: r.customer }))
        : "";
      return `<tr class="dash-drill-row" ${drillAttrs} title="Открыть сделку">
      <td><a class="deal-page-link" href="#deal/${encodeURIComponent(r.id)}" onclick="return dealPageLinkClick(event)">${escapeHtml(r.customer)}</a></td>
      <td><small>${escapeHtml(r.stage || "—")}</small></td>
      <td><small>${escapeHtml(r.owner || "—")}</small></td>
      <td>${escapeHtml(r.start || "—")}</td>
      <td>${escapeHtml(r.end || "—")}</td>
    </tr>`;
    }).join("")}</tbody></table></div>`;
}

function getPresaleFilterCols() {
  const base = typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : [];
  const keys = new Set(base.map(c => c.key));
  const extra = [];
  if (!keys.has("presaleStage")) {
    extra.push({
      key: "presaleStage",
      label: "Этап пре-сейл",
      filter: "multiselect",
      filterOptions: () => typeof presaleStageOptions === "function" ? presaleStageOptions() : [],
      get: d => (typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : d.presale?.stage) || "—",
    });
  }
  if (!keys.has("presaleOwner")) {
    extra.push({
      key: "presaleOwner",
      label: "Отв. пре-сейл",
      filter: "multiselect",
      filterOptions: () => typeof getPresaleStaffNames === "function"
        ? getPresaleStaffNames()
        : (state?.lists?.presale_owners || []),
      get: d => (d.presale?.owner || "").trim() || "—",
    });
  }
  return [...extra, ...base];
}

function presaleApplyAmoFilters(deals, filters) {
  const rows = deals || [];
  const cols = getPresaleFilterCols();
  if (typeof dealMatchesAmoFilters !== "function") return rows;
  return rows.filter(d => dealMatchesAmoFilters(d, filters || {}, cols));
}

function closePresaleDashboardFilterPop() {
  presaleDashboardFilterOpen = false;
  const pop = document.getElementById("presale-dash-filter-pop");
  if (pop) pop.hidden = true;
  if (typeof unregisterAmoFilterPop === "function") unregisterAmoFilterPop();
}

function openPresaleDashboardFilterPop(anchorBtn) {
  const pop = document.getElementById("presale-dash-filter-pop");
  const inner = document.getElementById("presale-dash-filter-inner");
  if (!pop) return;
  pop.hidden = false;
  if (typeof mountAmoFilterPanel === "function") {
    mountAmoFilterPanel(inner || pop, {
      filters: presaleDashboardAmoFilters,
      cols: getPresaleFilterCols(),
      deals: getWorkspaceDeals(),
      onApply: f => {
        presaleDashboardAmoFilters = { ...f };
        closePresaleDashboardFilterPop();
        renderPresalePanel();
      },
      onReset: () => { presaleDashboardAmoFilters = {}; },
      onClose: () => closePresaleDashboardFilterPop(),
    });
  }
  if (typeof registerAmoFilterPop === "function") {
    registerAmoFilterPop(pop, anchorBtn?.closest(".amo-filter-anchor") || anchorBtn, closePresaleDashboardFilterPop);
  }
}

function closePresaleKanbanFilterPop() {
  presaleKanbanFilterOpen = false;
  const pop = document.getElementById("presale-kanban-filter-pop");
  if (pop) pop.hidden = true;
  if (typeof unregisterAmoFilterPop === "function") unregisterAmoFilterPop();
}

function openPresaleKanbanFilterPop(anchorBtn) {
  const pop = document.getElementById("presale-kanban-filter-pop");
  const inner = document.getElementById("presale-kanban-filter-inner");
  if (!pop) return;
  pop.hidden = false;
  if (typeof mountAmoFilterPanel === "function") {
    mountAmoFilterPanel(inner || pop, {
      filters: presaleKanbanFilters,
      cols: getPresaleFilterCols(),
      deals: getWorkspaceDeals(),
      onApply: f => {
        presaleKanbanFilters = { ...f, q: presaleKanbanFilters.q };
        closePresaleKanbanFilterPop();
        renderPresaleKanbanBoardOnly();
        const meta = document.getElementById("presale-kanban-meta");
        if (meta) meta.textContent = `${presaleKanbanFilteredDeals().length} сделок`;
        const btn = document.getElementById("presale-kanban-filters-btn");
        const n = typeof amoFilterActiveCount === "function"
          ? amoFilterActiveCount(presaleKanbanFilters, getPresaleFilterCols())
          : 0;
        if (btn) btn.textContent = n ? `🔍 Фильтры (${n})` : "🔍 Фильтры";
      },
      onReset: () => { presaleKanbanFilters = { q: presaleKanbanFilters.q }; },
      onClose: () => closePresaleKanbanFilterPop(),
    });
  }
  if (typeof registerAmoFilterPop === "function") {
    registerAmoFilterPop(pop, anchorBtn?.closest(".amo-filter-anchor") || anchorBtn, closePresaleKanbanFilterPop);
  }
}

function renderWorkspaceSwitcher() {
  const slot = document.getElementById("workspace-switcher");
  if (!slot) return;
  const cur = typeof getActiveWorkspaceId === "function" ? getActiveWorkspaceId() : "sales";
  const workspaces = typeof listWorkspacesFlat === "function" ? listWorkspacesFlat() : [];
  slot.innerHTML = `
    <label class="workspace-switch muted">
      <span>Пространство</span>
      <select id="workspace-select" class="workspace-select" data-workspace-id="${escapeHtml(cur)}">
        ${workspaces.map(w => `<option value="${escapeHtml(w.id)}"${w.id === cur ? " selected" : ""}>${escapeHtml(w.label)}</option>`).join("")}
      </select>
    </label>`;
  const sel = document.getElementById("workspace-select");
  if (!sel) return;
  sel.value = cur;
  sel.onchange = () => {
    const next = sel.value || "sales";
    if (typeof setActiveWorkspaceId === "function") setActiveWorkspaceId(next);
    if (typeof onWorkspaceChanged === "function") onWorkspaceChanged(next);
  };
}

function onWorkspaceChanged(wsId) {
  const id = wsId || (typeof getActiveWorkspaceId === "function" ? getActiveWorkspaceId() : "sales");
  const presale = id === "presale";
  const reference = typeof isReferenceWorkspace === "function" && isReferenceWorkspace(id);
  document.body.classList.toggle("workspace-presale", presale);
  document.body.classList.toggle("workspace-sales", id === "sales");
  document.body.classList.toggle("workspace-reference", reference);
  if (typeof invalidateMetricsCache === "function") invalidateMetricsCache();
  renderWorkspaceSwitcher();
  if (typeof updateNavForWorkspace === "function") updateNavForWorkspace(id);
  if (typeof updateDealCountBadge === "function") updateDealCountBadge();
  if (typeof renderActivePage === "function") renderActivePage();
}

function updateNavForWorkspace(wsId) {
  const presale = wsId === "presale";
  const reference = typeof isReferenceWorkspace === "function" && isReferenceWorkspace(wsId);
  document.querySelectorAll(".nav-presale-only").forEach(el => { el.hidden = !presale; });
  document.querySelectorAll(".nav-sales-only").forEach(el => { el.hidden = presale || reference; });
}

function calcPresaleMetrics(deals) {
  const list = deals || [];
  const stages = typeof presaleKanbanStageColumns === "function"
    ? presaleKanbanStageColumns()
    : (typeof presaleStageOptions === "function" ? presaleStageOptions() : []);
  const stageCounts = Object.fromEntries(stages.map(s => [s, 0]));
  let active = 0;
  let success = 0;
  let failed = 0;
  let overdue = 0;
  const now = Date.now();
  list.forEach(d => {
    const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "");
    if (stages.includes(st)) stageCounts[st]++;
    if (st === "В процессе пилота" || st === "Подготовка к пилоту") active++;
    if (st === "Успех пилота" || d.presale?.successWithoutPilot) success++;
    if (st === "Отказ") failed++;
    const end = d.presale?.pilotEnd;
    if (end && st === "В процессе пилота") {
      const t = new Date(end).getTime();
      if (!Number.isNaN(t) && t < now) overdue++;
    }
  });
  const stageFunnel = stages.map(st => ({ stage: st, count: stageCounts[st] || 0 }));
  const maxStage = Math.max(1, ...stageFunnel.map(x => x.count));
  const noStage = list.filter(d => !(typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "").trim())).length;
  return { pipelineCount: list.length, active, success, failed, overdue, noStage, stageFunnel, maxStage, deals: list };
}

function presaleConversionDealIds(deals, period, toStage) {
  return [...new Set(collectPresaleStageTransitions(deals, period.from, period.to)
    .filter(x => x.to === toStage)
    .map(x => x.dealId)
    .filter(Boolean))];
}

function withPresaleDashboardFilters(spec) {
  if (typeof buildDealsReportSpec !== "function") return spec || { filters: {}, preset: null };
  const filters = { ...(spec?.filters || {}) };
  const amo = presaleDashboardAmoFilters || {};
  const cols = typeof getPresaleFilterCols === "function" ? getPresaleFilterCols() : [];
  cols.forEach(col => {
    const vals = typeof amoFilterGetMultiselect === "function" ? amoFilterGetMultiselect(amo, col.key) : [];
    if (vals.length && !filters[col.key]?.length) filters[col.key] = [...vals];
    if (amo[`${col.key}__from`] && !filters[`${col.key}__from`]) filters[`${col.key}__from`] = amo[`${col.key}__from`];
    if (amo[`${col.key}__to`] && !filters[`${col.key}__to`]) filters[`${col.key}__to`] = amo[`${col.key}__to`];
    const textVal = (amo[col.key] || "").toString().trim();
    if (!vals.length && textVal && !(typeof amoFilterIsRange === "function" && amoFilterIsRange(col))) {
      if (!filters[col.key]) filters[col.key] = textVal;
    }
  });
  return buildDealsReportSpec(filters, spec?.preset, spec?.mineOnly);
}

function presaleDashDrill(spec) {
  return typeof drillRowAttrs === "function" ? drillRowAttrs(withPresaleDashboardFilters(spec)) : "";
}

function openPresaleDealsReport(spec) {
  if (typeof setActiveWorkspaceId === "function") setActiveWorkspaceId("presale");
  const merged = withPresaleDashboardFilters(spec);
  if (typeof openDealsReport === "function") openDealsReport(merged);
}

function getPresaleDashboardDeals() {
  let deals = typeof getWorkspaceDeals === "function" ? getWorkspaceDeals() : (state?.deals || []);
  if (typeof dashboardMineOnly !== "undefined" && dashboardMineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) deals = deals.filter(d => mineFn(d));
  }
  if (typeof presaleApplyAmoFilters === "function") {
    deals = presaleApplyAmoFilters(deals, presaleDashboardAmoFilters);
  }
  return deals;
}

function buildPresaleDashDrillSpec(drillEl) {
  if (!drillEl || typeof drillSpecFromElement !== "function") {
    return typeof buildDealsReportSpec === "function" ? buildDealsReportSpec() : { filters: {}, preset: null };
  }
  let spec = withPresaleDashboardFilters(drillSpecFromElement(drillEl));
  if (typeof filterDealsForReportSpec === "function") {
    const matched = filterDealsForReportSpec(getPresaleDashboardDeals(), spec);
    const ids = matched.map(d => d.id).filter(Boolean);
    if (ids.length && ids.length <= 800 && typeof buildDealsReportSpec === "function") {
      return withPresaleDashboardFilters(buildDealsReportSpec(
        {},
        { type: "dealIds", value: ids.join("|") },
        spec.mineOnly,
        spec.scoringMode,
        { skipTableSearch: true },
      ));
    }
  }
  return spec;
}

function openPresaleDealsReportFromDrill(drillEl) {
  if (!drillEl) return;
  openPresaleDealsReport(buildPresaleDashDrillSpec(drillEl));
}

function presaleMetricCard(label, value, sub, drillAttrs) {
  if (typeof metricCardDrill === "function") return metricCardDrill(label, value, sub, drillAttrs || "");
  return `<div class="metric-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div>${sub ? `<div class="sub muted">${escapeHtml(sub)}</div>` : ""}</div>`;
}

function renderPresalePanel() {
  const el = document.getElementById("page-panel");
  if (!el) return;
  let deals = getWorkspaceDeals();
  if (typeof dashboardMineOnly !== "undefined" && dashboardMineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) deals = deals.filter(d => mineFn(d));
  }
  deals = presaleApplyAmoFilters(deals, presaleDashboardAmoFilters);
  const m = calcPresaleMetrics(deals);
  const maxStage = m.maxStage || 1;
  const filterN = typeof amoFilterActiveCount === "function"
    ? amoFilterActiveCount(presaleDashboardAmoFilters, getPresaleFilterCols())
    : 0;
  const period = presaleDashPeriod || defaultPresaleDashPeriod();
  const conversions = calcPresaleConversions(deals, period);
  const funnelHtml = renderPresaleFunnelChart(m.stageFunnel, maxStage, presaleDashDrill);
  const convHtml = conversions.map(c => {
    const ids = c.entered ? presaleConversionDealIds(deals, period, c.to) : [];
    const drillAttrs = ids.length
      ? presaleDashDrill(buildDealsReportSpec({}, { type: "dealIds", value: ids.join("|") }))
      : "";
    const drillCls = drillAttrs ? " presale-conv-row--drill dash-drill-row" : "";
    return `<div class="presale-conv-row${drillCls}" ${drillAttrs} title="${ids.length ? "Открыть сделки" : ""}">
      <span class="presale-conv-label">${escapeHtml(c.label)}</span>
      <span class="presale-conv-val">${c.entered} / ${c.total}</span>
      <span class="presale-conv-pct"><strong>${c.pct}%</strong></span></div>`;
  }).join("");
  const timelineHtml = renderPresalePilotTimeline(deals, presaleDashDrill);
  const drill = presaleDashDrill;

  el.innerHTML = `<div data-presale-dash="1">
    <div class="dashboard-filters dashboard-filters-bar">
      <span class="muted">Пространство: <strong>Пре-сейл</strong></span>
      <label class="muted presale-period-label">Период
        <input type="date" id="presale-dash-from" value="${escapeHtml(period.from)}">
        —
        <input type="date" id="presale-dash-to" value="${escapeHtml(period.to)}">
      </label>
      <button type="button" class="btn btn-sm" id="presale-dash-period-month">Месяц</button>
      <div class="amo-filter-anchor">
        <button type="button" class="btn btn-sm${presaleDashboardFilterOpen ? " btn-primary" : ""}" id="presale-dash-filters-btn">🔍 Фильтры${filterN ? ` (${filterN})` : ""}</button>
        <div class="amo-filter-pop" id="presale-dash-filter-pop" ${presaleDashboardFilterOpen ? "" : "hidden"}>
          <div id="presale-dash-filter-inner"></div>
        </div>
      </div>
      <button type="button" class="btn btn-sm" id="presale-dash-clear-filters">Сбросить</button>
    </div>
    <div class="grid grid-4" style="margin-bottom:1rem">
      ${presaleMetricCard("В воронке", m.pipelineCount, "сделки от «Встреча состоялась»", drill(buildDealsReportSpec({}, { type: "presalePipeline" })))}
      ${presaleMetricCard("Активные пилоты", m.active, "подготовка и в процессе", drill(buildDealsReportSpec({}, { type: "presaleActive" })))}
      ${presaleMetricCard("Успешные", m.success, "успех пилота / без пилота", drill(buildDealsReportSpec({}, { type: "presaleSuccess" })))}
      ${presaleMetricCard("Провалы", m.failed, "этап «Отказ»", drill(buildDealsReportSpec({}, { type: "presaleFailed" })))}
    </div>
    <div class="grid grid-2" style="margin-bottom:1rem;gap:1rem">
      <div class="card"><div class="card-header">Воронка пре-сейла (сейчас)</div><div class="card-body">${funnelHtml}</div></div>
      <div class="card"><div class="card-header">Конверсия за период</div><div class="card-body presale-conv-list">${convHtml || "<p class=\"muted\">Нет смен этапов за период</p>"}
        <p class="muted small" style="margin-top:.75rem">Формула: сделки, пришедшие в этап / всего смен этапов за период.</p></div></div>
    </div>
    ${typeof dashWidgetCard === "function" ? dashWidgetCard("requirements-dashboard", "Требования к пилоту и продукту", typeof renderRequirementsDashboardBody === "function" ? renderRequirementsDashboardBody(null) : "<p class='muted'>Загрузка…</p>") : ""}
    <div class="card" style="margin-top:1rem"><div class="card-header">Timeline пилотов</div><div class="card-body">${timelineHtml}</div></div>
  </div>`;

  const applyPeriod = () => {
    const from = document.getElementById("presale-dash-from")?.value;
    const to = document.getElementById("presale-dash-to")?.value;
    if (from && to) {
      savePresaleDashPeriod({ from, to });
      renderPresalePanel();
    }
  };
  document.getElementById("presale-dash-from")?.addEventListener("change", applyPeriod);
  document.getElementById("presale-dash-to")?.addEventListener("change", applyPeriod);
  document.getElementById("presale-dash-period-month")?.addEventListener("click", () => {
    savePresaleDashPeriod(defaultPresaleDashPeriod());
    renderPresalePanel();
  });
  document.getElementById("presale-dash-filters-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    if (presaleDashboardFilterOpen) closePresaleDashboardFilterPop();
    else {
      presaleDashboardFilterOpen = true;
      openPresaleDashboardFilterPop(e.currentTarget);
    }
  });
  document.getElementById("presale-dash-clear-filters")?.addEventListener("click", () => {
    presaleDashboardAmoFilters = {};
    if (typeof invalidateRequirementsDashCache === "function") invalidateRequirementsDashCache();
    renderPresalePanel();
  });
  if (presaleDashboardFilterOpen) openPresaleDashboardFilterPop(document.getElementById("presale-dash-filters-btn"));
  if (typeof bindDashboardWidgetFilterEvents === "function") bindDashboardWidgetFilterEvents(el);
  if (typeof scheduleRequirementsDashboardLoad === "function") scheduleRequirementsDashboardLoad();
}

function presaleKanbanFilteredDeals() {
  let deals = getWorkspaceDeals().filter(d => !d.archived);
  const q = (presaleKanbanFilters.q || "").trim().toLowerCase();
  if (q) {
    deals = deals.filter(d => {
      const hay = `${d.customer || ""} ${d.id || ""} ${d.owner || ""} ${d.presale?.owner || ""} ${d.presale?.stage || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  deals = presaleApplyAmoFilters(deals, presaleKanbanFilters);
  if (presaleKanbanMineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) deals = deals.filter(d => mineFn(d));
  }
  return deals;
}

function presaleKanbanColSummary(col) {
  const scores = col.map(d => (typeof enrichDeal === "function" ? enrichDeal(d).score : null)).filter(v => v != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return {
    count: col.length,
    sum: col.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    avgScore,
  };
}

function presaleKanbanCard(d) {
  const canEdit = typeof canEditPresaleDeal === "function" ? canEditPresaleDeal(d) : canEditDeal(d);
  const ed = typeof enrichDeal === "function" ? enrichDeal(d) : d;
  const pOwner = presaleOwnerName(d) || "—";
  const category = ed.category || "—";
  const badgeCls = typeof categoryBadgeClass === "function" ? categoryBadgeClass(category) : "badge-reserve";
  const kaitenUrl = d.presale?.kaitenCardUrl || "";
  const kaitenIcon = kaitenUrl
    ? `<span class="kanban-kaiten-link" role="link" tabindex="0" title="Kaiten" data-href="${escapeHtml(kaitenUrl)}">K</span>`
    : "";
  const avatar = typeof ownerAvatarHtml === "function" ? ownerAvatarHtml(pOwner) : "";
  const amt = typeof formatMoney === "function" ? formatMoney(d.amount || 0) : (d.amount || 0);
  return `<a class="kanban-card presale-kanban-card" href="#deal/${encodeURIComponent(d.id || "")}" draggable="${canEdit}" data-id="${escapeHtml(d.id)}" data-return="kanban" onclick="return dealPageLinkClick(event)">
    <div class="kanban-card-title-row">
      <div class="kanban-card-title">${escapeHtml(d.customer || "—")}</div>
      ${kaitenIcon}
    </div>
    <div class="kanban-card-meta">
      <span class="badge ${badgeCls}">${escapeHtml(category)}</span>
      ${ed.score != null ? `<span class="kanban-card-score">${ed.score}</span>` : ""}
    </div>
    <div class="kanban-card-foot">
      <span class="kanban-card-owner muted">${avatar}<span class="kanban-card-owner-name">${escapeHtml(pOwner)}</span></span>
      <span class="kanban-card-amt">${amt}</span>
    </div>
  </a>`;
}

function renderPresaleKanbanBoardOnly() {
  const board = document.getElementById("presale-kanban-board");
  if (!board) return;
  const stages = typeof presaleKanbanStageColumns === "function"
    ? presaleKanbanStageColumns()
    : (typeof presaleStageOptions === "function" ? presaleStageOptions() : []);
  const deals = presaleKanbanFilteredDeals();
  board.innerHTML = stages.map(stageCol => {
    const col = deals.filter(d => {
      const st = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d.presale?.stage || "");
      return st === stageCol;
    });
    const { count, sum, avgScore } = presaleKanbanColSummary(col);
  return `<div class="kanban-col" data-stage="${escapeHtml(stageCol)}">
      ${typeof kanbanColHeadHtml === "function"
        ? kanbanColHeadHtml(stageCol, count, sum, avgScore)
        : `<div class="kanban-col-head"><div class="kanban-col-title">${escapeHtml(stageCol)}</div><span class="badge">${count}</span></div>`}
      <div class="kanban-col-body" data-stage="${escapeHtml(stageCol)}">
        ${col.map(d => presaleKanbanCard(d)).join("")}
      </div>
    </div>`;
  }).join("");
  const meta = document.getElementById("presale-kanban-meta");
  if (meta) meta.textContent = `${deals.length} сделок`;
  if (typeof bindKanbanMinimap === "function") {
    bindKanbanMinimap({
      boardId: "presale-kanban-board",
      minimapId: "presale-kanban-minimap",
      stages,
    });
  }
  bindPresaleKanbanDnD();
  bindPresaleKanbanKaitenLinks();
}

function bindPresaleKanbanKaitenLinks() {
  document.querySelectorAll("#presale-kanban-board .kanban-kaiten-link[data-href]").forEach(el => {
    const open = e => {
      e.preventDefault();
      e.stopPropagation();
      const url = el.dataset.href;
      if (url) window.open(url, "_blank", "noopener");
    };
    el.onclick = open;
    el.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") open(e);
    };
  });
}

function bindPresaleKanbanDnD() {
  let dragged = null;
  document.querySelectorAll("#presale-kanban-board .kanban-card").forEach(card => {
    card.addEventListener("dragstart", e => { dragged = card; e.dataTransfer.effectAllowed = "move"; });
    card.addEventListener("dragend", () => { dragged = null; });
  });
  document.querySelectorAll("#presale-kanban-board .kanban-col-body").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      if (!dragged) return;
      const dealId = dragged.dataset.id;
      const newStage = col.dataset.stage;
      const idx = typeof findDealIdxById === "function"
        ? findDealIdxById(dealId)
        : state.deals.findIndex(d => d.id === dealId);
      if (idx < 0) return;
      const deal = state.deals[idx];
      const curStage = typeof resolvePresaleStage === "function" ? resolvePresaleStage(deal) : (deal?.presale?.stage || "");
      if (curStage === newStage) return;
      if (typeof canEditPresaleDeal === "function" ? !canEditPresaleDeal(deal) : !canEditDeal(deal)) {
        alert("Нет прав на изменение этапа пре-сейла");
        return;
      }
      try {
        const res = await apiSavePresale(dealId, { stage: newStage });
        if (res?.deal) state.deals[idx] = typeof migrateDeal === "function" ? migrateDeal(res.deal) : res.deal;
        else if (res?.presale) {
          state.deals[idx].presale = res.presale;
          if (res.presale.stage) state.deals[idx].presale_stage = res.presale.stage;
        }
        if (typeof persistStateCache === "function") persistStateCache(state);
        renderPresaleKanbanBoardOnly();
        if (typeof showToast === "function") showToast(`Этап пре-сейла → ${newStage}`);
      } catch (err) {
        alert(err.message || String(err));
        renderPresaleKanbanBoardOnly();
      }
    });
  });
}

function renderPresaleKanban() {
  const el = document.getElementById("page-kanban");
  if (!el) return;
  const deals = presaleKanbanFilteredDeals();
  const filterN = typeof amoFilterActiveCount === "function"
    ? amoFilterActiveCount(presaleKanbanFilters, getPresaleFilterCols())
    : 0;
  el.innerHTML = `
    <div class="kanban-page presale-kanban">
      <div class="kanban-toolbar">
        <input type="search" id="presale-kanban-search" class="kanban-search" placeholder="Быстрый поиск…" value="${escapeHtml(presaleKanbanFilters.q || "")}">
        <label class="dash-mine-toggle muted kanban-mine-toggle"><input type="checkbox" id="presale-kanban-mine-only" ${presaleKanbanMineOnly ? "checked" : ""}> Только мои</label>
        <div class="amo-filter-anchor">
          <button type="button" class="btn btn-sm${presaleKanbanFilterOpen ? " btn-primary" : ""}" id="presale-kanban-filters-btn">🔍 Фильтры${filterN ? ` (${filterN})` : ""}</button>
          <div class="amo-filter-pop" id="presale-kanban-filter-pop" ${presaleKanbanFilterOpen ? "" : "hidden"}>
            <div id="presale-kanban-filter-inner"></div>
          </div>
        </div>
        <button type="button" class="btn btn-sm" id="presale-kanban-clear-filters">Сбросить</button>
        <span class="muted kanban-hint" id="presale-kanban-meta">${deals.length} сделок</span>
      </div>
      <div class="kanban-wrap">
        <div class="kanban-board" id="presale-kanban-board"></div>
        <div class="kanban-minimap" id="presale-kanban-minimap" title="Навигация по этапам"></div>
      </div>
    </div>`;
  renderPresaleKanbanBoardOnly();
  document.getElementById("presale-kanban-search")?.addEventListener("input", e => {
    presaleKanbanFilters.q = e.target.value;
    renderPresaleKanbanBoardOnly();
  });
  document.getElementById("presale-kanban-mine-only")?.addEventListener("change", e => {
    presaleKanbanMineOnly = e.target.checked;
    localStorage.setItem("itmen_presale_kanban_mine", presaleKanbanMineOnly ? "1" : "0");
    renderPresaleKanbanBoardOnly();
  });
  document.getElementById("presale-kanban-filters-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    if (presaleKanbanFilterOpen) closePresaleKanbanFilterPop();
    else {
      presaleKanbanFilterOpen = true;
      openPresaleKanbanFilterPop(e.currentTarget);
    }
  });
  document.getElementById("presale-kanban-clear-filters")?.addEventListener("click", () => {
    presaleKanbanFilters = { q: presaleKanbanFilters.q };
    renderPresaleKanbanBoardOnly();
    renderPresaleKanban();
  });
  if (presaleKanbanFilterOpen) openPresaleKanbanFilterPop(document.getElementById("presale-kanban-filters-btn"));
}

function renderActiveKanban() {
  const ref = typeof isReferenceWorkspace === "function" && isReferenceWorkspace();
  const presale = typeof isPresaleWorkspace === "function" && isPresaleWorkspace();
  if (ref && typeof renderReferenceKanban === "function") renderReferenceKanban();
  else if (presale && typeof renderPresaleKanban === "function") renderPresaleKanban();
  else if (typeof renderKanban === "function") renderKanban();
}

function mountWorkspaceUi() {
  try {
    if (!localStorage.getItem("itmen_active_workspace") && typeof setActiveWorkspaceId === "function") {
      setActiveWorkspaceId(typeof getDefaultWorkspaceId === "function" ? getDefaultWorkspaceId() : "sales");
    }
  } catch (_) { /* ignore */ }
  renderWorkspaceSwitcher();
  const ws = typeof getActiveWorkspaceId === "function" ? getActiveWorkspaceId() : "sales";
  document.body.classList.toggle("workspace-presale", ws === "presale");
  document.body.classList.toggle("workspace-sales", ws === "sales");
  document.body.classList.toggle("workspace-reference", typeof isReferenceWorkspace === "function" && isReferenceWorkspace(ws));
  if (typeof updateNavForWorkspace === "function") updateNavForWorkspace(ws);
}

window.renderWorkspaceSwitcher = renderWorkspaceSwitcher;
window.onWorkspaceChanged = onWorkspaceChanged;
window.calcPresaleMetrics = calcPresaleMetrics;
window.renderPresalePanel = renderPresalePanel;
window.renderActiveKanban = renderActiveKanban;
window.openPresaleDealsReport = openPresaleDealsReport;
window.openPresaleDealsReportFromDrill = openPresaleDealsReportFromDrill;
window.presaleDashDrill = presaleDashDrill;
window.withPresaleDashboardFilters = withPresaleDashboardFilters;
window.renderPresaleKanban = renderPresaleKanban;
window.mountWorkspaceUi = mountWorkspaceUi;
window.updateNavForWorkspace = updateNavForWorkspace;
window.getPresaleFilterCols = getPresaleFilterCols;
