/* Дашборд продаж: метрики задач */
let taskDashPeriod = "month";
let taskDashCustomFrom = "";
let taskDashCustomTo = "";
let taskDashData = null;
let taskDashLoading = false;
let taskDashFilterKey = "";

function getTaskDashOwnerFilter() {
  const wf = typeof dashboardWidgetFilters !== "undefined" ? dashboardWidgetFilters["task-metrics"] : null;
  if (!wf?.amo || typeof amoFilterGetMultiselect !== "function") return [];
  return amoFilterGetMultiselect(wf.amo, "owner");
}

async function apiLoadTaskMetrics(period, opts = {}) {
  const params = new URLSearchParams({ period: period || taskDashPeriod });
  if (period === "custom" || taskDashPeriod === "custom") {
    const from = opts.from || taskDashCustomFrom;
    const to = opts.to || taskDashCustomTo;
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  const owners = getTaskDashOwnerFilter();
  if (owners.length) params.set("owner", owners.join(","));
  return apiFetch(`/api/reports/task-metrics?${params}`);
}

function renderTaskDashTrend(trend) {
  if (!trend?.length) return `<div class="muted">Нет задач за период</div>`;
  const max = Math.max(1, ...trend.map(p => p.count || 0));
  return `<div class="task-dash-trend">${trend.map(p => {
    const h = Math.max(4, Math.round(((p.count || 0) / max) * 100));
    const label = String(p.date || "").slice(5);
    return `<div class="task-dash-trend-col" title="${escapeHtml(p.date)}: ${p.count}">
      <span class="task-dash-trend-val">${p.count || 0}</span>
      <div class="task-dash-trend-bar" style="height:${h}%"></div>
      <span class="task-dash-trend-label">${escapeHtml(label)}</span>
    </div>`;
  }).join("")}</div>`;
}

function renderTaskDashboardBody(data) {
  if (!data) return `<p class="muted">Загрузка метрик задач…</p>`;
  const s = data.summary || {};
  const customOpen = taskDashPeriod === "custom";
  const periodLabel = data.period === "custom" && data.from && data.to
    ? `${data.from} — ${data.to}`
    : ({ day: "день", week: "неделя", month: "месяц", quarter: "квартал" }[data.period] || data.period);

  return `<div class="task-dash-grid">
    <div class="task-dash-toolbar">
      <div class="dynamics-period-tabs">
        ${["week", "month", "quarter"].map(p =>
          `<button type="button" class="btn btn-sm dynamics-period-btn task-dash-period-btn${taskDashPeriod === p ? " active" : ""}" data-task-dash-period="${p}">${p === "week" ? "Неделя" : p === "month" ? "Месяц" : "Квартал"}</button>`
        ).join("")}
        <button type="button" class="btn btn-sm dynamics-period-btn task-dash-period-btn${customOpen ? " active" : ""}" data-task-dash-period="custom">Период</button>
      </div>
      <div class="dynamics-custom-range task-dash-custom-range"${customOpen ? "" : " hidden"}>
        <label class="muted" style="font-size:.78rem">С</label>
        <input type="date" id="task-dash-from" value="${escapeHtml(taskDashCustomFrom || data.from || "")}">
        <label class="muted" style="font-size:.78rem">По</label>
        <input type="date" id="task-dash-to" value="${escapeHtml(taskDashCustomTo || data.to || "")}">
        <button type="button" class="btn btn-sm btn-primary" id="task-dash-custom-apply">OK</button>
      </div>
      <span class="muted task-dash-hint">за ${escapeHtml(periodLabel)}</span>
    </div>
    <div class="grid grid-5 task-dash-summary">
      <div class="metric-card"><div class="label">Задач создано</div><div class="value">${s.taskCount ?? "—"}</div></div>
      <div class="metric-card"><div class="label">В срок</div><div class="value">${s.onTimePct != null ? `${s.onTimePct}%` : "—"}</div><div class="sub">${s.doneCount ?? 0} выполнено</div></div>
      <div class="metric-card"><div class="label">Просрочка</div><div class="value">${s.overduePct != null ? `${s.overduePct}%` : "—"}</div><div class="sub">${s.openOverdue ?? 0} открытых проср.</div></div>
      <div class="metric-card"><div class="label">На сделку / стадию</div><div class="value">${s.avgPerDeal ?? "—"} / ${s.avgPerStage ?? "—"}</div></div>
      <div class="metric-card"><div class="label">Ср. время задачи</div><div class="value">${escapeHtml(s.avgCompletionLabel || "—")}</div><div class="sub">создание → выполнение</div></div>
    </div>
    <div class="section-title">Задачи по дням</div>
    ${renderTaskDashTrend(data.trend)}
  </div>`;
}

async function refreshTaskDashboard(period, opts = {}) {
  if (!window.ITMEN_API?.enabled) return;
  if (period) taskDashPeriod = period;
  if (opts.from) taskDashCustomFrom = opts.from;
  if (opts.to) taskDashCustomTo = opts.to;
  taskDashLoading = true;
  const host = document.querySelector('[data-dash-widget="task-metrics"] .dash-widget-body');
  if (host) host.innerHTML = renderTaskDashboardBody(null);
  try {
    taskDashData = await apiLoadTaskMetrics(taskDashPeriod, opts);
    taskDashFilterKey = getTaskDashOwnerFilter().join("|");
    if (taskDashPeriod === "custom" && taskDashData?.from) taskDashCustomFrom = taskDashData.from;
    if (taskDashPeriod === "custom" && taskDashData?.to) taskDashCustomTo = taskDashData.to;
    if (host) {
      host.innerHTML = renderTaskDashboardBody(taskDashData);
      bindTaskDashboardEvents(host);
    }
  } catch (e) {
    console.error(e);
    if (host) host.innerHTML = `<p class="muted">Не удалось загрузить метрики задач</p>`;
  } finally {
    taskDashLoading = false;
  }
}

function bindTaskDashboardEvents(host) {
  if (!host || host.dataset.taskDashBound) return;
  host.dataset.taskDashBound = "1";
  host.addEventListener("click", e => {
    const btn = e.target.closest(".task-dash-period-btn");
    if (btn) {
      e.preventDefault();
      const p = btn.dataset.taskDashPeriod;
      if (p === "custom") {
        taskDashPeriod = "custom";
        if (!taskDashCustomFrom) {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          taskDashCustomFrom = d.toISOString().slice(0, 10);
        }
        if (!taskDashCustomTo) taskDashCustomTo = new Date().toISOString().slice(0, 10);
        host.innerHTML = renderTaskDashboardBody(taskDashData || { period: "custom", summary: {}, trend: [] });
      } else {
        refreshTaskDashboard(p);
      }
      return;
    }
    if (e.target.id === "task-dash-custom-apply") {
      e.preventDefault();
      const from = document.getElementById("task-dash-from")?.value || "";
      const to = document.getElementById("task-dash-to")?.value || "";
      if (!from || !to) return;
      refreshTaskDashboard("custom", { from, to });
    }
  });
}

function scheduleTaskDashboardLoad() {
  const host = document.querySelector('[data-dash-widget="task-metrics"] .dash-widget-body');
  if (!host || !window.ITMEN_API?.enabled) return;
  if (typeof activePage !== "undefined" && activePage !== "panel") return;
  const filterKey = getTaskDashOwnerFilter().join("|");
  if (taskDashData && taskDashData.period === taskDashPeriod && taskDashFilterKey === filterKey) {
    host.innerHTML = renderTaskDashboardBody(taskDashData);
    bindTaskDashboardEvents(host);
    return;
  }
  refreshTaskDashboard(taskDashPeriod);
}

window.renderTaskDashboardBody = renderTaskDashboardBody;
window.scheduleTaskDashboardLoad = scheduleTaskDashboardLoad;
window.refreshTaskDashboard = refreshTaskDashboard;
