/* Дашборд: топ требований к пилоту и продукту (пре-сейл) */

let requirementsDashCache = null;
let requirementsDashLoading = null;
let requirementsDashSort = {
  pilot: { date: "desc", pct: "desc" },
  product: { date: "desc", pct: "desc" },
};

function requirementsDashDealIds() {
  if (typeof isPresaleWorkspace === "function" && isPresaleWorkspace()) {
    let deals = typeof getWorkspaceDeals === "function" ? getWorkspaceDeals() : (state?.deals || []);
    if (typeof dashboardMineOnly !== "undefined" && dashboardMineOnly) {
      const mineFn = typeof isDealMineForCurrentUser === "function"
        ? isDealMineForCurrentUser
        : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
      if (mineFn) deals = deals.filter(d => mineFn(d));
    }
    if (typeof presaleApplyAmoFilters === "function" && typeof presaleDashboardAmoFilters !== "undefined") {
      deals = presaleApplyAmoFilters(deals, presaleDashboardAmoFilters);
    }
    return deals.map(d => d.id).filter(Boolean);
  }
  return [];
}

async function loadRequirementsDashboardData(force) {
  if (!window.ITMEN_API?.enabled) return null;
  const dealIds = requirementsDashDealIds();
  const cacheKey = dealIds.slice().sort().join("|");
  if (!force && requirementsDashCache?.key === cacheKey) return requirementsDashCache.data;
  if (requirementsDashLoading) return requirementsDashLoading;
  requirementsDashLoading = (async () => {
    try {
      const qs = dealIds.length ? `?dealIds=${encodeURIComponent(dealIds.join("|"))}` : "";
      const data = typeof crmFetch === "function"
        ? await crmFetch(`/api/reports/requirements-summary${qs}`)
        : await (async () => {
          const res = await fetch(`/api/reports/requirements-summary${qs}`, { headers: authHeaders?.() || {} });
          if (!res.ok) throw new Error(await res.text());
          return res.json();
        })();
      requirementsDashCache = { key: cacheKey, data };
      return data;
    } catch (e) {
      console.warn("requirements dashboard:", e);
      return null;
    } finally {
      requirementsDashLoading = null;
    }
  })();
  return requirementsDashLoading;
}

function reqDashAvgPct(items) {
  const rows = items || [];
  if (!rows.length) return null;
  if (rows[0]?.avgPct != null && rows.every(r => r.avgPct != null)) {
    const sum = rows.reduce((a, r) => a + (Number(r.avgPct) || 0), 0);
    return Math.round(sum / rows.length);
  }
  const sum = rows.reduce((a, r) => a + (Number(r.pct ?? r.avgPct) || 0), 0);
  return Math.round(sum / rows.length);
}

function reqDashClientAvgPct(client) {
  if (client?.avgPct != null) return Number(client.avgPct);
  return reqDashAvgPct(client?.top || []);
}

function sortReqDashClients(clients, kind) {
  const sort = requirementsDashSort[kind] || { date: "desc", pct: "desc" };
  const list = [...(clients || [])];
  list.sort((a, b) => {
    if (sort.pct) {
      const av = reqDashClientAvgPct(a) ?? 0;
      const bv = reqDashClientAvgPct(b) ?? 0;
      if (av !== bv) return sort.pct === "asc" ? av - bv : bv - av;
    }
    if (sort.date) {
      const at = String(a.latestAt || "");
      const bt = String(b.latestAt || "");
      if (at !== bt) return sort.date === "asc" ? at.localeCompare(bt) : bt.localeCompare(at);
    }
    return String(a.customer || "").localeCompare(String(b.customer || ""), "ru");
  });
  return list;
}

function reqDashDrillDealsSpec(dealIds) {
  const ids = (dealIds || []).filter(Boolean);
  if (!ids.length || typeof buildDealsReportSpec !== "function") return null;
  const spec = buildDealsReportSpec({}, { type: "dealIds", value: ids.join("|") });
  return typeof withPresaleDashboardFilters === "function" ? withPresaleDashboardFilters(spec) : spec;
}

function openReqDashDealWithRequirement(dealId, kind, reqText) {
  if (!dealId) return;
  try {
    sessionStorage.setItem("itmen_req_highlight", JSON.stringify({
      dealId,
      kind: kind || "pilot",
      text: reqText || "",
    }));
  } catch (_) { /* ignore */ }
  if (typeof setActiveWorkspaceId === "function") setActiveWorkspaceId("presale");
  const tab = kind === "product" ? "product-req" : "pilot-req";
  if (typeof openDealPageWithTab === "function") openDealPageWithTab(dealId, tab);
  else if (typeof openDealPage === "function") openDealPage(dealId);
}

function openReqDashDealsTable(dealIds) {
  const spec = reqDashDrillDealsSpec(dealIds);
  if (!spec) return;
  if (typeof openPresaleDealsReport === "function") openPresaleDealsReport(spec);
  else if (typeof openDealsReport === "function") openDealsReport(spec);
}

function renderReqDashSortBar(kind) {
  const sort = requirementsDashSort[kind] || { date: "desc", pct: "desc" };
  const opt = (val, cur) => `<option value="${val}"${cur === val ? " selected" : ""}>`;
  return `<div class="req-dash-sort-bar">
    <label class="req-dash-sort-field">
      <span class="muted">Дата</span>
      <select class="req-dash-sort-select" data-req-sort="date" data-req-kind="${escapeHtml(kind)}">
        ${opt("desc", sort.date)}Новые → старые</option>
        ${opt("asc", sort.date)}Старые → новые</option>
      </select>
    </label>
    <label class="req-dash-sort-field">
      <span class="muted">%</span>
      <select class="req-dash-sort-select" data-req-sort="pct" data-req-kind="${escapeHtml(kind)}">
        ${opt("desc", sort.pct)}Высокий → низкий</option>
        ${opt("asc", sort.pct)}Низкий → высокий</option>
      </select>
    </label>
  </div>`;
}

function renderReqDashOverallTable(rows, kind) {
  if (!rows?.length) return `<p class="muted">Нет данных</p>`;
  const body = rows.map((r, i) => `
    <tr class="req-dash-overall-row req-dash-drill-row" role="button" tabindex="0"
      data-req-drill="deals" data-req-kind="${escapeHtml(kind)}"
      data-req-deal-ids="${escapeHtml((r.dealIds || []).join("|"))}"
      title="Открыть сделки по этому требованию">
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(r.text)}</td>
      <td class="num"><span class="req-dash-pct-badge">${r.avgPct}%</span></td>
      <td class="num">${r.dealCount}</td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="dash-table req-dash-overall-table">
    <thead><tr><th>#</th><th>Требование</th><th>Реализ.</th><th>Клиентов</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function renderReqDashClientAccordion(clients, kind) {
  if (!clients?.length) return `<p class="muted">Нет данных</p>`;
  const sorted = sortReqDashClients(clients, kind);
  const rows = sorted.slice(0, 15).map((c, idx) => {
    const avg = reqDashClientAvgPct(c) ?? "—";
    const reqItems = (c.top || []).map(r => `
      <li class="req-dash-req-item req-dash-drill-row" role="button" tabindex="0"
        data-req-drill="deal" data-req-kind="${escapeHtml(kind)}"
        data-req-deal-id="${escapeHtml(c.dealId || "")}"
        data-req-text="${escapeHtml(r.text || "")}"
        title="Открыть карточку сделки с этим требованием">
        <span class="req-dash-pct-badge">${r.pct}%</span>
        <span class="req-dash-req-text">${escapeHtml(r.text)}</span>
        ${r.feasibility && r.feasibility !== "—" ? `<span class="muted req-dash-feas">${escapeHtml(r.feasibility)}</span>` : ""}
      </li>`).join("") || `<li class="muted">Нет требований</li>`;
    return `<details class="req-dash-client-details"${idx < 3 ? " open" : ""}>
      <summary class="req-dash-client-summary">
        <span class="req-dash-client-chevron" aria-hidden="true">▸</span>
        <span class="req-dash-client-title">${escapeHtml(c.customer)}</span>
        <span class="req-dash-client-meta">
          <span class="req-dash-pct-badge req-dash-pct-badge--lg">${avg}%</span>
          <span class="muted">${c.count} треб.</span>
          <button type="button" class="btn btn-sm req-dash-open-deal"
            data-req-deal-id="${escapeHtml(c.dealId || "")}"
            data-req-kind="${escapeHtml(kind)}"
            title="Открыть сделку">↗</button>
        </span>
      </summary>
      <ul class="req-dash-req-list">${reqItems}</ul>
    </details>`;
  }).join("");
  return `<div class="req-dash-accordion">${rows}</div>`;
}

function renderRequirementsDashboardBody(data) {
  if (!data) return `<p class="muted">Загрузка требований…</p>`;
  const pilotClients = data.pilotByClients || [];
  const productClients = data.productByClients || [];
  const pilotAvg = reqDashAvgPct(pilotClients.flatMap(c => c.top || []));
  const productAvg = reqDashAvgPct(productClients.flatMap(c => c.top || []));

  return `<div class="req-dash-grid">
    <div class="req-dash-summary-row">
      <div class="req-dash-summary-card">
        <div class="req-dash-summary-label">Пилот · ср. реализуемость</div>
        <div class="req-dash-summary-value">${pilotAvg != null ? `${pilotAvg}%` : "—"}</div>
        <div class="muted small">${pilotClients.length} клиентов в срезе</div>
      </div>
      <div class="req-dash-summary-card">
        <div class="req-dash-summary-label">Продукт · ср. реализуемость</div>
        <div class="req-dash-summary-value">${productAvg != null ? `${productAvg}%` : "—"}</div>
        <div class="muted small">${productClients.length} клиентов в срезе</div>
      </div>
    </div>
    <div class="grid grid-2 req-dash-panels">
      <div class="req-dash-panel" data-req-panel="pilot">
        <div class="req-dash-panel-head">
          <h4 class="req-dash-panel-title">По клиентам · пилот</h4>
          ${renderReqDashSortBar("pilot")}
        </div>
        ${renderReqDashClientAccordion(pilotClients, "pilot")}
      </div>
      <div class="req-dash-panel" data-req-panel="product">
        <div class="req-dash-panel-head">
          <h4 class="req-dash-panel-title">По клиентам · продукт</h4>
          ${renderReqDashSortBar("product")}
        </div>
        ${renderReqDashClientAccordion(productClients, "product")}
      </div>
    </div>
    <div class="grid grid-2 req-dash-panels" style="margin-top:1rem">
      <div class="req-dash-panel">
        <h4 class="req-dash-panel-title">Общий топ · пилот</h4>
        ${renderReqDashOverallTable(data.pilotTopOverall || [], "pilot")}
      </div>
      <div class="req-dash-panel">
        <h4 class="req-dash-panel-title">Общий топ · продукт</h4>
        ${renderReqDashOverallTable(data.productTopOverall || [], "product")}
      </div>
    </div>
  </div>`;
}

function refreshRequirementsDashboardView(host) {
  const el = host || document.querySelector('[data-dash-widget="requirements-dashboard"] .dash-widget-body');
  if (!el || !requirementsDashCache?.data) return;
  el.innerHTML = renderRequirementsDashboardBody(requirementsDashCache.data);
  bindRequirementsDashboardDrill(el);
}

function bindRequirementsDashboardDrill(host) {
  if (!host) return;
  if (!host.dataset.reqDrillBound) {
    host.dataset.reqDrillBound = "1";
    host.addEventListener("click", e => {
      const openBtn = e.target.closest(".req-dash-open-deal");
      if (openBtn) {
        e.preventDefault();
        e.stopPropagation();
        openReqDashDealWithRequirement(openBtn.dataset.reqDealId, openBtn.dataset.reqKind, "");
        return;
      }
      const reqItem = e.target.closest(".req-dash-req-item[data-req-drill]");
      if (reqItem) {
        e.preventDefault();
        e.stopPropagation();
        openReqDashDealWithRequirement(
          reqItem.dataset.reqDealId,
          reqItem.dataset.reqKind || "pilot",
          reqItem.dataset.reqText || "",
        );
        return;
      }
      const overallRow = e.target.closest(".req-dash-overall-row[data-req-drill]");
      if (overallRow && overallRow.dataset.reqDrill === "deals") {
        e.preventDefault();
        e.stopPropagation();
        const ids = (overallRow.dataset.reqDealIds || "").split("|").filter(Boolean);
        openReqDashDealsTable(ids);
      }
    });
    host.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest(".req-dash-req-item[data-req-drill], .req-dash-overall-row[data-req-drill]");
      if (!row) return;
      e.preventDefault();
      row.click();
    });
    host.addEventListener("change", e => {
      const sel = e.target.closest(".req-dash-sort-select");
      if (!sel) return;
      const kind = sel.dataset.reqKind || "pilot";
      const axis = sel.dataset.reqSort || "date";
      if (!requirementsDashSort[kind]) requirementsDashSort[kind] = { date: "desc", pct: "desc" };
      requirementsDashSort[kind][axis] = sel.value === "asc" ? "asc" : "desc";
      refreshRequirementsDashboardView(host);
    });
  }
}

function scheduleRequirementsDashboardLoad() {
  const host = document.querySelector('[data-dash-widget="requirements-dashboard"] .dash-widget-body');
  if (!host) return;
  loadRequirementsDashboardData(false).then(data => {
    if (!data) {
      host.innerHTML = `<p class="muted">Требования недоступны (нужен сервер API)</p>`;
      return;
    }
    host.innerHTML = renderRequirementsDashboardBody(data);
    bindRequirementsDashboardDrill(host);
  });
}

function invalidateRequirementsDashCache() {
  requirementsDashCache = null;
}

window.loadRequirementsDashboardData = loadRequirementsDashboardData;
window.renderRequirementsDashboardBody = renderRequirementsDashboardBody;
window.scheduleRequirementsDashboardLoad = scheduleRequirementsDashboardLoad;
window.invalidateRequirementsDashCache = invalidateRequirementsDashCache;
window.openReqDashDealWithRequirement = openReqDashDealWithRequirement;
window.openReqDashDealsTable = openReqDashDealsTable;
