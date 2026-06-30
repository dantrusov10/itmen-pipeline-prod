/* Динамика пайплайна — тренды и топ изменений балла */
let dynamicsPeriod = "week";
let dynamicsCustomFrom = "";
let dynamicsCustomTo = "";
let dynamicsTrendPeriod = "week";
let dynamicsTrendCustomFrom = "";
let dynamicsTrendCustomTo = "";
let dynamicsData = null;
let dynamicsLoading = false;

async function apiLoadDynamics(period, opts = {}) {
  const params = new URLSearchParams({ period: period || dynamicsPeriod });
  if (period === "custom" || dynamicsPeriod === "custom") {
    const from = opts.from || dynamicsCustomFrom;
    const to = opts.to || dynamicsCustomTo;
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  const trendPeriod = opts.trendPeriod || dynamicsTrendPeriod || period || dynamicsPeriod;
  params.set("trendPeriod", trendPeriod);
  if (trendPeriod === "custom") {
    const tFrom = opts.trendFrom || dynamicsTrendCustomFrom;
    const tTo = opts.trendTo || dynamicsTrendCustomTo;
    if (tFrom) params.set("trendFrom", tFrom);
    if (tTo) params.set("trendTo", tTo);
  }
  const qs = params.toString();
  if (window.ITMEN_API?.backend === "pocketbase") {
    return apiFetch(`/api/dynamics?${qs}`);
  }
  if (window.ITMEN_API?.backend !== "gas") return null;
  const url = `${window.ITMEN_API.gasUrl}?action=dynamics&${qs}`;
  const res = await fetch(url, { redirect: "follow" });
  const data = JSON.parse(await res.text());
  if (data.error) throw new Error(data.error);
  return data;
}

function formatDelta(n, suffix = "") {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${suffix === "₽" ? formatMoney(n) : n}${suffix && suffix !== "₽" ? suffix : ""}`;
}

function deltaClass(n) {
  if (n > 0) return "delta-up";
  if (n < 0) return "delta-down";
  return "delta-flat";
}

function formatDynamicsDateLabel(dateStr, live) {
  if (live) return "сейчас";
  return String(dateStr || "").slice(5);
}

function formatDynamicsAt(at) {
  if (!at) return "—";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return String(at).replace("T", " ").slice(0, 16);
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderDynamicsTrendChart(trend) {
  if (!trend?.length) {
    return `<div class="muted">Нет данных за период. Первый снапшот — сегодня в 23:59 МСК.</div>`;
  }
  const W = 520;
  const H = 168;
  const padL = 12;
  const padR = 12;
  const padT = 26;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const values = trend.map(p => Number(p.totalPipeline) || 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || Math.max(Math.abs(max), 1);
  const n = trend.length;
  const colW = chartW / Math.max(1, n);

  const points = trend.map((p, i) => {
    const val = Number(p.totalPipeline) || 0;
    const x = padL + colW * i + colW / 2;
    const y = padT + chartH - ((val - min) / range) * chartH;
    return { x, y, val, p };
  });

  const linePath = points.map((pt, i) => `${i ? "L" : "M"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const bars = points.map(pt => {
    const baseY = padT + chartH;
    const h = Math.max(2, baseY - pt.y);
    const barW = Math.min(24, colW * 0.55);
    const x = pt.x - barW / 2;
    return `<rect class="dynamics-trend-bar-svg" x="${x.toFixed(1)}" y="${pt.y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3">
      <title>${escapeHtml(pt.p.date)}: ${formatMoney(pt.val)}</title>
    </rect>`;
  }).join("");

  const labels = points.map(pt => {
    const label = formatDynamicsDateLabel(pt.p.date, pt.p.live);
    return `<text class="dynamics-trend-axis-label" x="${pt.x.toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="middle">${escapeHtml(label)}</text>`;
  }).join("");

  const valueLabels = points.map(pt =>
    `<text class="dynamics-trend-value-label" x="${pt.x.toFixed(1)}" y="${Math.max(12, pt.y - 6).toFixed(1)}" text-anchor="middle">${escapeHtml(formatMoney(pt.val))}</text>`
  ).join("");

  const dots = points.map(pt =>
    `<circle class="dynamics-trend-dot" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3.5"><title>${escapeHtml(pt.p.date)}: ${formatMoney(pt.val)}</title></circle>`
  ).join("");

  return `<div class="dynamics-trend-wrap">
    <svg class="dynamics-trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Тренд пайплайна">
      ${bars}
      <path class="dynamics-trend-line" d="${linePath}" fill="none"></path>
      ${dots}
      ${valueLabels}
      ${labels}
    </svg>
  </div>`;
}

function renderDynamicsPeriodButtons(prefix, activePeriod, customOpen) {
  return `
    ${["day", "week", "month", "quarter"].map(p =>
      `<button type="button" class="btn btn-sm dynamics-period-btn${activePeriod === p ? " active" : ""}" data-${prefix}-period="${p}">${p === "day" ? "День" : p === "week" ? "Неделя" : p === "month" ? "Месяц" : "Квартал"}</button>`
    ).join("")}
    <button type="button" class="btn btn-sm dynamics-period-btn${customOpen ? " active" : ""}" data-${prefix}-period="custom">Период</button>`;
}

function renderDynamicsDeltaTable(rows, kind) {
  if (!rows?.length) {
    return `<div class="muted">Нет ${kind === "gain" ? "роста" : "падения"} балла за период</div>`;
  }
  return `<table class="dash-table dynamics-delta-table">
    <thead><tr><th>Клиент</th><th>Владелец</th><th>Было</th><th>Сейчас</th><th>Баллы</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="dynamics-score-row" data-dyn-score-deal="${escapeHtml(r.dealId)}" title="Изменения скоринга">
      <td>${escapeHtml(r.customer)}</td>
      <td>${escapeHtml(r.owner)}</td>
      <td class="num">${r.was}</td>
      <td class="num">${r.now}</td>
      <td class="num ${deltaClass(r.delta)}">${r.delta > 0 ? "+" : ""}${r.delta}</td>
    </tr>`).join("")}
    </tbody>
  </table>`;
}

function dynamicsDrillIds(data, key) {
  if (!data) return [];
  switch (key) {
    case "pipeline":
      return (data.pipelineAmountDeltas || []).map(r => r.dealId).filter(Boolean);
    case "weighted":
      return (data.weightedAmountDeltas || []).map(r => r.dealId).filter(Boolean);
    case "score":
      if (data.scoreDeltaDealIds?.length) return data.scoreDeltaDealIds;
      return [...new Set([...(data.topGains || []), ...(data.topLosses || [])].map(r => r.dealId).filter(Boolean))];
    case "deals":
      return [...new Set((data.periodDealChanges || data.dealCountChanges || []).map(r => r.dealId).filter(Boolean))];
    default:
      return [];
  }
}

function buildDynamicsDrillSpec(key, data) {
  const ids = dynamicsDrillIds(data, key);
  if (!ids.length) return null;
  const preset = { type: key === "deals" ? "dealCountDelta" : `${key}Delta`, value: ids.join("|") };
  const filters = key === "weighted" ? { category: ["Горячая", "Тёплая"] } : {};
  return buildDealsReportSpec(filters, preset);
}

function dynamicsSummaryHasDrill(key, data) {
  if (dynamicsDrillIds(data, key).length > 0) return true;
  const s = data?.summary || {};
  if (key === "pipeline" && s.pipelineDelta) return true;
  if (key === "weighted" && s.weightedDelta) return true;
  if (key === "score" && s.avgScoreDelta) return true;
  if (key === "deals" && s.dealCountDelta) return true;
  return false;
}

function renderDynamicsMetricCard(label, value, sub, drillKey, title, data) {
  const canDrill = drillKey && dynamicsSummaryHasDrill(drillKey, data);
  const drill = canDrill ? " metric-card--drill" : "";
  const t = title ? ` title="${escapeHtml(title)}"` : "";
  const attrs = canDrill ? ` data-dyn-drill="${drillKey}"` : "";
  return `<div class="metric-card${drill}"${attrs}${t}><div class="label">${escapeHtml(label)}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}

function dynamicsPeriodLabel(data) {
  if (data?.period === "custom" && data.from && data.to) return `${data.from} — ${data.to}`;
  const map = { day: "день", week: "неделя", month: "месяц", quarter: "квартал" };
  return map[data?.period] || data?.period || "";
}

function dynamicsTrendPeriodLabel(data) {
  const p = data?.trendPeriod || data?.period;
  if (p === "custom" && data?.trendFrom && data?.trendTo) return `${data.trendFrom} — ${data.trendTo}`;
  const map = { day: "день", week: "неделя", month: "месяц", quarter: "квартал" };
  return map[p] || p || "";
}

function findDynamicsScoreRow(dealId) {
  if (!dynamicsData || !dealId) return null;
  return [...(dynamicsData.topGains || []), ...(dynamicsData.topLosses || [])]
    .find(r => r.dealId === dealId) || null;
}

const DYNAMICS_SCORE_KEYS = [
  "loyalty", "commit", "budget", "fit", "timing", "competitive", "access", "technical", "commercial",
];

const DYNAMICS_SCORE_LABELS = {
  loyalty: "Лояльность",
  commit: "Коммит",
  budget: "Бюджет",
  fit: "Соответствие",
  timing: "Срочность",
  competitive: "Конкуренция",
  access: "Доступ",
  technical: "Тех. соответствие",
  commercial: "Коммерция",
};

function dynamicsScoreKeyLabel(key) {
  const c = (window.ITMEN_CONFIG?.scoreCriteria || []).find(x => x.key === key);
  if (DYNAMICS_SCORE_LABELS[key]) return DYNAMICS_SCORE_LABELS[key];
  if (c?.name) return c.name;
  return key;
}

function parseDynamicsScoresRaw(raw) {
  if (raw == null || raw === "" || raw === "—") return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function formatDynamicsProb(val) {
  if (val == null || val === "" || val === "—") return "—";
  const s = String(val).replace("%", "").trim().replace(",", ".");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return String(val);
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}%`;
}

function formatDynamicsCommit(val) {
  if (!val || val === "—") return "—";
  if (typeof commitLabel === "function" && typeof normalizeCommitStatus === "function") {
    return commitLabel(normalizeCommitStatus(val)) || String(val);
  }
  return String(val);
}

function formatDynamicsPlainValue(label, raw) {
  if (raw == null || raw === "" || raw === "—") return "—";
  const lab = String(label || "").trim();
  if (lab === "Вероятность") return formatDynamicsProb(raw);
  if (lab === "Статус коммита") return formatDynamicsCommit(raw);
  const s = String(raw).trim();
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

function renderDynamicsScoresSummary(scores) {
  if (!scores || typeof scores !== "object") return `<span class="muted">—</span>`;
  const pills = DYNAMICS_SCORE_KEYS.map(k => {
    const v = scores[k];
    if (v == null || v === "") return "";
    return `<span class="dynamics-score-pill"><span class="dynamics-score-pill-label">${escapeHtml(dynamicsScoreKeyLabel(k))}</span> <strong>${v}</strong></span>`;
  }).filter(Boolean);
  if (!pills.length) return `<span class="muted">—</span>`;
  return `<div class="dynamics-score-pill-grid">${pills.join("")}</div>`;
}

function renderDynamicsScoresDiff(oldRaw, newRaw) {
  const oldS = parseDynamicsScoresRaw(oldRaw) || {};
  const newS = parseDynamicsScoresRaw(newRaw) || {};
  const changed = DYNAMICS_SCORE_KEYS.filter(k => (oldS[k] ?? 0) !== (newS[k] ?? 0));
  if (!changed.length) return renderDynamicsScoresSummary(newS);
  return `<div class="dynamics-score-diff-grid">${changed.map(k => `
    <div class="dynamics-score-diff-row">
      <span class="dynamics-score-diff-label">${escapeHtml(dynamicsScoreKeyLabel(k))}</span>
      <span class="dynamics-score-diff-val"><span class="muted">${oldS[k] ?? 0}</span> → <strong>${newS[k] ?? 0}</strong></span>
    </div>`).join("")}</div>`;
}

function renderDynamicsScoreChangeValues(ch) {
  const lab = String(ch.label || "").trim();
  if (lab === "Скоринг" || parseDynamicsScoresRaw(ch.oldValue) || parseDynamicsScoresRaw(ch.newValue)) {
    return renderDynamicsScoresDiff(ch.oldValue, ch.newValue);
  }
  const oldF = formatDynamicsPlainValue(lab, ch.oldValue);
  const newF = formatDynamicsPlainValue(lab, ch.newValue);
  return `<div class="dynamics-score-change-values-line"><span class="muted">${escapeHtml(oldF)}</span> → <strong>${escapeHtml(newF)}</strong></div>`;
}

function renderDynamicsScoreChangesList(changes) {
  if (!changes?.length) {
    return `<p class="muted">За выбранный период нет зафиксированных изменений полей, повлиявших на балл.</p>`;
  }
  return `<ul class="dynamics-score-changes">
    ${changes.map(ch => `<li class="dynamics-score-change-item">
      <div class="dynamics-score-change-head">
        <span class="dynamics-score-change-label">${escapeHtml(ch.label)}</span>
        <span class="dynamics-score-change-impact ${deltaClass(Number(ch.impact))}">${escapeHtml(ch.impact)}</span>
      </div>
      <div class="dynamics-score-change-values">${renderDynamicsScoreChangeValues(ch)}</div>
      <div class="dynamics-score-change-meta muted">${escapeHtml(formatDynamicsAt(ch.at))} · ${escapeHtml(ch.by || "—")}</div>
    </li>`).join("")}
  </ul>`;
}

function ensureDynamicsScoreModal() {
  let overlay = document.getElementById("dynamics-score-modal");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "dynamics-score-modal";
  overlay.innerHTML = `<div class="modal dynamics-score-modal dynamics-score-modal-wide">
    <div class="modal-header modal-header-sticky">
      <h3 id="dynamics-score-modal-title">Изменения скоринга</h3>
      <button type="button" class="btn btn-sm" data-dynamics-score-close aria-label="Закрыть">✕</button>
    </div>
    <div class="modal-body" id="dynamics-score-modal-body"></div>
    <div class="modal-footer dynamics-score-modal-footer">
      <button type="button" class="btn btn-primary btn-sm" id="dynamics-score-open-deal">Открыть сделку</button>
      <button type="button" class="btn btn-sm" data-dynamics-score-close>Закрыть</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => {
    if (e.target === overlay || e.target.closest("[data-dynamics-score-close]")) {
      overlay.classList.remove("open");
    }
  });
  return overlay;
}

function openDynamicsScoreModal(dealId) {
  const row = findDynamicsScoreRow(dealId);
  if (!row) return;
  const overlay = ensureDynamicsScoreModal();
  const title = document.getElementById("dynamics-score-modal-title");
  const body = document.getElementById("dynamics-score-modal-body");
  const openBtn = document.getElementById("dynamics-score-open-deal");
  if (title) {
    title.textContent = `${row.customer || dealId} · ${row.was} → ${row.now} (${row.delta > 0 ? "+" : ""}${row.delta})`;
  }
  if (body) {
    body.innerHTML = `
      <div class="dynamics-score-modal-summary">
        <div><span class="muted">Владелец:</span> ${escapeHtml(row.owner || "—")}</div>
        <div><span class="muted">Балл:</span> <strong>${row.was}</strong> → <strong>${row.now}</strong>
          <span class="${deltaClass(row.delta)}">(${row.delta > 0 ? "+" : ""}${row.delta})</span></div>
      </div>
      <div class="section-title" style="margin-top:1rem">Что повлияло на балл</div>
      ${renderDynamicsScoreChangesList(row.scoreChanges)}`;
  }
  if (openBtn) {
    openBtn.onclick = () => {
      overlay.classList.remove("open");
      if (typeof openDealById === "function") openDealById(dealId);
      else if (typeof openDealPage === "function") openDealPage(dealId, activePage || "panel");
    };
  }
  overlay.classList.add("open");
}

function renderDynamicsBlock(data) {
  const el = document.getElementById("dynamics-block");
  if (!el) return;
  if (!data) {
    el.innerHTML = window.ITMEN_API?.enabled
      ? `<div class="muted">Загрузка динамики…</div>`
      : `<div class="muted">Динамика доступна при подключении к серверу.</div>`;
    return;
  }
  const s = data.summary || {};
  const periodLabel = dynamicsPeriodLabel(data);
  const trendPeriodLabel = dynamicsTrendPeriodLabel(data);
  const customOpen = dynamicsPeriod === "custom";
  const trendCustomOpen = dynamicsTrendPeriod === "custom";
  el.innerHTML = `
    <div class="dynamics-toolbar">
      <div class="dynamics-period-tabs">
        ${renderDynamicsPeriodButtons("dyn", dynamicsPeriod, customOpen)}
      </div>
      <div class="dynamics-custom-range"${customOpen ? "" : " hidden"}>
        <label class="muted" style="font-size:.78rem">С</label>
        <input type="date" id="dyn-from" value="${escapeHtml(dynamicsCustomFrom || data.from || "")}">
        <label class="muted" style="font-size:.78rem">По</label>
        <input type="date" id="dyn-to" value="${escapeHtml(dynamicsCustomTo || data.to || "")}">
        <button type="button" class="btn btn-sm btn-primary" id="dyn-custom-apply">OK</button>
      </div>
      ${!data.hasSnapshots ? `<span class="muted dynamics-hint">Снапшоты с сегодняшнего дня (23:59 МСК). Пока — данные из аудита.</span>` : ""}
    </div>
    <div class="grid grid-4 dynamics-summary" style="margin-bottom:1rem">
      ${renderDynamicsMetricCard("Пайплайн", `<span class="${deltaClass(s.pipelineDelta)}">${formatDelta(s.pipelineDelta, "₽")}</span>`, `за ${periodLabel}`, "pipeline", "Сделки с изменением суммы", data)}
      ${renderDynamicsMetricCard("Взвешенный", `<span class="${deltaClass(s.weightedDelta)}">${formatDelta(s.weightedDelta, "₽")}</span>`, "горячие + тёплые", "weighted", "Сделки с изменением взвешенного прогноза (горячие и тёплые)", data)}
      ${renderDynamicsMetricCard("Средний балл", `<span class="${deltaClass(s.avgScoreDelta)}">${formatDelta(s.avgScoreDelta)}</span>`, s.baselineDate ? `от ${s.baselineDate}` : "база из аудита", "score", "Сделки с изменением балла", data)}
      ${renderDynamicsMetricCard("Сделок", `<span class="${deltaClass(s.dealCountDelta)}">${formatDelta(s.dealCountDelta)}</span>`, `${data.snapshotDays || 0} дн. снапшотов`, "deals", "Добавленные, отказные и заархивированные за период", data)}
    </div>
    <div class="grid grid-2">
      <div class="dynamics-trend-panel">
        <div class="dynamics-trend-head">
          <div class="section-title">Тренд пайплайна (₽)</div>
          <span class="muted dynamics-trend-sub">за ${escapeHtml(trendPeriodLabel)}</span>
        </div>
        <div class="dynamics-trend-toolbar">
          <div class="dynamics-period-tabs dynamics-trend-period-tabs">
            ${renderDynamicsPeriodButtons("dyn-trend", dynamicsTrendPeriod, trendCustomOpen)}
          </div>
          <div class="dynamics-custom-range dynamics-trend-custom-range"${trendCustomOpen ? "" : " hidden"}>
            <label class="muted" style="font-size:.78rem">С</label>
            <input type="date" id="dyn-trend-from" value="${escapeHtml(dynamicsTrendCustomFrom || data.trendFrom || "")}">
            <label class="muted" style="font-size:.78rem">По</label>
            <input type="date" id="dyn-trend-to" value="${escapeHtml(dynamicsTrendCustomTo || data.trendTo || "")}">
            <button type="button" class="btn btn-sm btn-primary" id="dyn-trend-custom-apply">OK</button>
          </div>
        </div>
        ${renderDynamicsTrendChart(data.pipelineTrend)}
      </div>
      <div class="grid grid-2">
        <div>
          <div class="section-title">Топ роста балла</div>
          ${renderDynamicsDeltaTable(data.topGains, "gain")}
        </div>
        <div>
          <div class="section-title">Топ падения балла</div>
          ${renderDynamicsDeltaTable(data.topLosses, "loss")}
        </div>
      </div>
    </div>`;
}

async function refreshDynamics(period, opts = {}) {
  if (!window.ITMEN_API?.enabled) {
    dynamicsData = null;
    renderDynamicsBlock(null);
    return;
  }
  if (period) dynamicsPeriod = period;
  if (opts.from) dynamicsCustomFrom = opts.from;
  if (opts.to) dynamicsCustomTo = opts.to;
  if (opts.trendPeriod) dynamicsTrendPeriod = opts.trendPeriod;
  if (opts.trendFrom) dynamicsTrendCustomFrom = opts.trendFrom;
  if (opts.trendTo) dynamicsTrendCustomTo = opts.trendTo;
  dynamicsLoading = true;
  renderDynamicsBlock(null);
  try {
    dynamicsData = await apiLoadDynamics(dynamicsPeriod, opts);
    if (dynamicsPeriod === "custom" && dynamicsData?.from) dynamicsCustomFrom = dynamicsData.from;
    if (dynamicsPeriod === "custom" && dynamicsData?.to) dynamicsCustomTo = dynamicsData.to;
    if (dynamicsData?.trendPeriod) dynamicsTrendPeriod = dynamicsData.trendPeriod;
    if (dynamicsTrendPeriod === "custom" && dynamicsData?.trendFrom) dynamicsTrendCustomFrom = dynamicsData.trendFrom;
    if (dynamicsTrendPeriod === "custom" && dynamicsData?.trendTo) dynamicsTrendCustomTo = dynamicsData.trendTo;
    renderDynamicsBlock(dynamicsData);
  } catch (e) {
    console.error(e);
    const el = document.getElementById("dynamics-block");
    if (el) el.innerHTML = `<div class="muted">Не удалось загрузить динамику: ${escapeHtml(e.message || "ошибка")}</div>`;
  } finally {
    dynamicsLoading = false;
  }
}

async function refreshDynamicsTrend(period, opts = {}) {
  if (!window.ITMEN_API?.enabled) return;
  if (period) dynamicsTrendPeriod = period;
  if (opts.trendFrom) dynamicsTrendCustomFrom = opts.trendFrom;
  if (opts.trendTo) dynamicsTrendCustomTo = opts.trendTo;
  dynamicsLoading = true;
  try {
    const data = await apiLoadDynamics(dynamicsPeriod, {
      from: dynamicsCustomFrom,
      to: dynamicsCustomTo,
      trendPeriod: dynamicsTrendPeriod,
      trendFrom: opts.trendFrom || dynamicsTrendCustomFrom,
      trendTo: opts.trendTo || dynamicsTrendCustomTo,
    });
    dynamicsData = { ...(dynamicsData || {}), ...data };
    if (dynamicsTrendPeriod === "custom" && data?.trendFrom) dynamicsTrendCustomFrom = data.trendFrom;
    if (dynamicsTrendPeriod === "custom" && data?.trendTo) dynamicsTrendCustomTo = data.trendTo;
    renderDynamicsBlock(dynamicsData);
  } catch (e) {
    console.error(e);
    if (typeof showToast === "function") showToast("Не удалось обновить тренд");
  } finally {
    dynamicsLoading = false;
  }
}

let dynamicsObserver = null;

function scheduleDynamicsLoad() {
  if (!window.ITMEN_API?.enabled) return;
  if (typeof activePage !== "undefined" && activePage !== "panel") return;
  const block = document.getElementById("dynamics-block");
  if (!block) return;
  dynamicsObserver?.disconnect();
  if (dynamicsData && dynamicsData.period === dynamicsPeriod
    && (dynamicsPeriod !== "custom" || (dynamicsData.from === dynamicsCustomFrom && dynamicsData.to === dynamicsCustomTo))
    && (dynamicsData.trendPeriod || dynamicsPeriod) === dynamicsTrendPeriod) {
    renderDynamicsBlock(dynamicsData);
    return;
  }
  renderDynamicsBlock(null);
  dynamicsObserver = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && !dynamicsLoading) {
      dynamicsObserver?.disconnect();
      refreshDynamics(dynamicsPeriod);
    }
  }, { rootMargin: "120px", threshold: 0.01 });
  dynamicsObserver.observe(block);
}

function openDynamicsDrill(key) {
  if (!dynamicsData || typeof openDealsReport !== "function") return;
  const spec = buildDynamicsDrillSpec(key, dynamicsData);
  if (!spec) return;
  let out = typeof withDashboardFilters === "function" ? withDashboardFilters(spec) : spec;
  if (typeof withWidgetFilters === "function") out = withWidgetFilters("dynamics", out);
  openDealsReport(out);
}

function bindDynamicsEvents() {
  const panel = document.getElementById("page-panel");
  if (!panel || panel.dataset.dynBound) return;
  panel.dataset.dynBound = "1";
  panel.addEventListener("click", e => {
    const scoreRow = e.target.closest(".dynamics-score-row");
    if (scoreRow?.dataset.dynScoreDeal) {
      e.preventDefault();
      openDynamicsScoreModal(scoreRow.dataset.dynScoreDeal);
      return;
    }
    const trendBtn = e.target.closest("[data-dyn-trend-period]");
    if (trendBtn) {
      e.preventDefault();
      const p = trendBtn.dataset.dynTrendPeriod;
      if (p === "custom") {
        dynamicsTrendPeriod = "custom";
        if (!dynamicsTrendCustomFrom) {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          dynamicsTrendCustomFrom = d.toISOString().slice(0, 10);
        }
        if (!dynamicsTrendCustomTo) dynamicsTrendCustomTo = new Date().toISOString().slice(0, 10);
        renderDynamicsBlock(dynamicsData || { period: dynamicsPeriod, trendPeriod: "custom", summary: {}, pipelineTrend: [] });
      } else {
        refreshDynamicsTrend(p);
      }
      return;
    }
    if (e.target.id === "dyn-trend-custom-apply") {
      e.preventDefault();
      const from = document.getElementById("dyn-trend-from")?.value || "";
      const to = document.getElementById("dyn-trend-to")?.value || "";
      if (!from || !to) return;
      refreshDynamicsTrend("custom", { trendFrom: from, trendTo: to });
      return;
    }
    const btn = e.target.closest("[data-dyn-period]");
    if (btn) {
      e.preventDefault();
      const p = btn.dataset.dynPeriod;
      if (p === "custom") {
        dynamicsPeriod = "custom";
        if (!dynamicsCustomFrom) {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          dynamicsCustomFrom = d.toISOString().slice(0, 10);
        }
        if (!dynamicsCustomTo) dynamicsCustomTo = new Date().toISOString().slice(0, 10);
        renderDynamicsBlock(dynamicsData || { period: "custom", summary: {}, pipelineTrend: [] });
      } else {
        refreshDynamics(p);
      }
      return;
    }
    if (e.target.id === "dyn-custom-apply") {
      e.preventDefault();
      const from = document.getElementById("dyn-from")?.value || "";
      const to = document.getElementById("dyn-to")?.value || "";
      if (!from || !to) return;
      refreshDynamics("custom", { from, to });
      return;
    }
    const drill = e.target.closest(".dynamics-summary .metric-card--drill");
    if (drill?.dataset.dynDrill) {
      e.preventDefault();
      openDynamicsDrill(drill.dataset.dynDrill);
    }
  });
}

function renderBudgetMatrix(m) {
  const periods = m.budgetMatrixPeriods || [];
  const statuses = m.budgetMatrixStatuses || [];
  const matrix = m.budgetMatrix || {};
  if (!periods.length || !statuses.length) {
    return `<div class="muted">Нет данных для матрицы</div>`;
  }
  return `<div class="table-wrap"><table class="dash-table budget-matrix">
    <thead><tr><th>Срок \\ Статус</th>${statuses.map(s => `<th title="${escapeHtml(s)}">${escapeHtml(s)}</th>`).join("")}</tr></thead>
    <tbody>${periods.map(period => `<tr>
      <th scope="row" title="${escapeHtml(period)}">${escapeHtml(period)}</th>
      ${statuses.map(st => {
        const cnt = matrix[period]?.[st] || 0;
        const attrs = cnt ? drillRowAttrs(withDashboardFilters(buildDealsReportSpec({ budgetPeriod: [period], budgetStatus: [st] }))) : "";
        return `<td class="budget-matrix-cell${cnt ? " dash-drill-row has-data" : ""}" ${attrs} title="${cnt ? "Открыть сделки" : ""}">${cnt || "—"}</td>`;
      }).join("")}
    </tr>`).join("")}
    </tbody>
  </table></div>`;
}

window.openDynamicsScoreModal = openDynamicsScoreModal;
window.refreshDynamicsTrend = refreshDynamicsTrend;
