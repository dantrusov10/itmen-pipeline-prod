/* Админ: журнал активностей — аудит полей + события CRM */
let activitiesFilters = {
  from: "",
  to: "",
  user: "",
  section: "",
  subsection: "",
  field: "",
  dealId: "",
  source: "all",
  q: "",
  scoreImpactDir: "",
  scoreImpactFrom: "",
  scoreImpactTo: "",
};
let activitiesData = null;
let activitiesLoading = false;
let activitiesSort = { key: "at", dir: "desc" };

function defaultActivitiesFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function defaultActivitiesTo() {
  return new Date().toISOString().slice(0, 10);
}

function readActivitiesFiltersFromForm(page) {
  const dir = page.querySelector("#act-score-dir")?.value || "";
  const fromEl = page.querySelector("#act-score-from");
  const toEl = page.querySelector("#act-score-to");
  return {
    from: page.querySelector("#act-from")?.value || "",
    to: page.querySelector("#act-to")?.value || "",
    user: page.querySelector("#act-user")?.value || "",
    section: page.querySelector("#act-section")?.value || "",
    subsection: page.querySelector("#act-subsection")?.value || "",
    dealId: page.querySelector("#act-deal")?.value?.trim() || "",
    source: page.querySelector("#act-source")?.value || "all",
    q: page.querySelector("#act-q")?.value?.trim() || "",
    scoreImpactDir: dir,
    scoreImpactFrom: (dir === "up" || dir === "down") ? (fromEl?.value?.trim() || "") : "",
    scoreImpactTo: (dir === "up" || dir === "down") ? (toEl?.value?.trim() || "") : "",
  };
}

function renderScoreImpactRangeInputs(dir, fromVal, toVal) {
  if (dir !== "up" && dir !== "down") return "";
  const label = dir === "up" ? "На сколько баллов увеличился" : "На сколько баллов уменьшился";
  return `<div class="act-score-range-row" id="act-score-range">
    <span class="act-score-range-label">${escapeHtml(label)}</span>
    <label class="act-score-range-field">от <input type="number" id="act-score-from" min="0" step="1" placeholder="0" value="${escapeHtml(fromVal || "")}"></label>
    <label class="act-score-range-field">до <input type="number" id="act-score-to" min="0" step="1" placeholder="∞" value="${escapeHtml(toVal || "")}"></label>
  </div>`;
}

function syncScoreRangeVisibility(page) {
  const dir = page.querySelector("#act-score-dir")?.value || "";
  const host = page.querySelector("#act-score-range-host");
  if (!host) return;
  if (dir === "up" || dir === "down") {
    if (!page.querySelector("#act-score-range")) {
      host.innerHTML = renderScoreImpactRangeInputs(dir, activitiesFilters.scoreImpactFrom, activitiesFilters.scoreImpactTo);
    }
    host.hidden = false;
  } else {
    host.hidden = true;
    host.innerHTML = "";
  }
}

function fmtScoreImpactCell(row) {
  const raw = row.scoreImpact;
  if (raw != null && raw !== "") return String(raw);
  const n = row.scoreImpactNum;
  if (n == null || n === "") return "";
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

async function apiLoadAdminActivities(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") q.set(k, String(v));
  });
  return crmFetch(`/api/admin/activities?${q}`);
}

function fmtActivityAt(at, row) {
  if (!at) return "—";
  if (typeof formatRuDateTime === "function") return formatRuDateTime(at);
  if (row?.atDisplay) return row.atDisplay;
  return String(at).replace("T", " ").slice(0, 16);
}

function isRecentActivity(at) {
  if (!at) return false;
  const t = new Date(at).getTime();
  return !Number.isNaN(t) && (Date.now() - t) < 10 * 60 * 1000;
}

function activitySortVal(row, key) {
  switch (key) {
    case "at": return row.at || "";
    case "scoreImpact": {
      if (row.scoreImpactNum != null && row.scoreImpactNum !== "") return row.scoreImpactNum;
      const v = row.scoreImpact;
      if (v == null || v === "" || v === "—") return null;
      const s = String(v).trim();
      const n = parseFloat(s.startsWith("+") ? s.slice(1) : s);
      return Number.isFinite(n) ? n : null;
    }
    default: return row[key] ?? "";
  }
}

function sortActivitiesItems(items) {
  const { key, dir } = activitiesSort;
  const mul = dir === "asc" ? 1 : -1;
  return [...(items || [])].sort((a, b) => {
    const av = activitySortVal(a, key);
    const bv = activitySortVal(b, key);
    if (key === "at") return mul * String(av).localeCompare(String(bv));
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return mul * (av - bv);
    return mul * String(av).localeCompare(String(bv), "ru");
  });
}

function activitiesSortInd(col) {
  if (activitiesSort.key !== col) return `<span class="sort-ind">↕</span>`;
  return `<span class="sort-ind">${activitiesSort.dir === "asc" ? "↑" : "↓"}</span>`;
}

function initActivitiesTableResize() {
  const tbl = document.querySelector(".activities-table");
  if (!tbl || typeof initTableColumnResize !== "function") return;
  delete tbl.dataset.resizeBound;
  initTableColumnResize(tbl, "itmen_activities_col_widths");
}

function renderActivitiesTable(items) {
  const sorted = sortActivitiesItems(items);
  if (!sorted.length) {
    return `<div class="muted" style="padding:1rem">Нет записей за выбранный период и фильтры.</div>`;
  }
  const cols = [
    { key: "at", label: "Когда" },
    { key: "user", label: "Кто" },
    { key: "dealId", label: "Сделка" },
    { key: "customer", label: "Клиент" },
    { key: "owner", label: "Владелец" },
    { key: "section", label: "Раздел" },
    { key: "subsection", label: "Подраздел" },
    { key: "action", label: "Действие" },
    { key: "oldValue", label: "Было" },
    { key: "newValue", label: "Стало" },
    { key: "scoreImpact", label: "Влияние на скоринг" },
  ];
  return `<div class="table-wrap"><table class="dash-table activities-table">
    <thead><tr>
      ${cols.map(c => `<th class="sortable" data-act-sort="${c.key}">${escapeHtml(c.label)}${activitiesSortInd(c.key)}</th>`).join("")}
    </tr></thead>
    <tbody>${sorted.map(r => {
      const impact = fmtScoreImpactCell(r);
      const impactNum = activitySortVal(r, "scoreImpact");
      const scoreCls = impact && impact !== "0"
        ? (impactNum > 0 ? " delta-up" : impactNum < 0 ? " delta-down" : "")
        : "";
      const recentCls = isRecentActivity(r.at) ? " activity-row-recent" : "";
      return `<tr class="dash-drill-row${recentCls}" ${drillRowAttrs(buildDealsReportSpec({ customer: r.customer }))} title="Открыть сделку">
      <td class="nowrap">${escapeHtml(fmtActivityAt(r.at, r))}</td>
      <td>${escapeHtml(r.user || "—")}</td>
      <td><code>${escapeHtml(r.dealId || "—")}</code></td>
      <td>${escapeHtml(r.customer || "—")}</td>
      <td>${escapeHtml(r.owner || "—")}</td>
      <td>${escapeHtml(r.section || "—")}</td>
      <td>${escapeHtml(r.subsection || "—")}</td>
      <td>${escapeHtml(r.action || r.field || "—")}</td>
      <td class="muted small">${escapeHtml(r.oldValue || "—")}</td>
      <td class="small">${escapeHtml(r.newValue || "—")}</td>
      <td class="num${scoreCls}">${impact ? escapeHtml(impact) : ""}</td>
    </tr>`;
    }).join("")}
    </tbody>
  </table></div>`;
}

async function loadActivities() {
  if (!window.ITMEN_API?.enabled) return;
  activitiesLoading = true;
  const host = document.getElementById("activities-body");
  if (host) host.innerHTML = `<div class="muted" style="padding:1rem">Загрузка…</div>`;
  try {
    activitiesData = await apiLoadAdminActivities({
      ...activitiesFilters,
      limit: 1000,
    });
    renderActivities();
  } catch (e) {
    console.error(e);
    if (host) host.innerHTML = `<div class="muted" style="padding:1rem">Ошибка: ${escapeHtml(e.message || "загрузка")}</div>`;
  } finally {
    activitiesLoading = false;
  }
}

function renderActivities() {
  const page = document.getElementById("page-activities");
  if (!page) return;
  const facets = activitiesData?.facets || {};
  const total = activitiesData?.total ?? 0;
  const from = activitiesFilters.from || defaultActivitiesFrom();
  const to = activitiesFilters.to || defaultActivitiesTo();
  const scoreDir = activitiesFilters.scoreImpactDir || "";

  page.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">Фильтры журнала</div>
      <div class="card-body activities-filters">
        <div class="grid grid-4" style="gap:.75rem;margin-bottom:.75rem">
          <div><label>С</label><input type="date" id="act-from" value="${escapeHtml(from)}"></div>
          <div><label>По</label><input type="date" id="act-to" value="${escapeHtml(to)}"></div>
          <div><label>Менеджер</label>
            <select id="act-user"><option value="">Все</option>
              ${(facets.users || []).map(u => `<option value="${escapeHtml(u)}"${activitiesFilters.user === u ? " selected" : ""}>${escapeHtml(u)}</option>`).join("")}
            </select>
          </div>
          <div><label>Источник</label>
            <select id="act-source">
              <option value="all"${activitiesFilters.source === "all" ? " selected" : ""}>Все</option>
              <option value="audit"${activitiesFilters.source === "audit" ? " selected" : ""}>Аудит полей</option>
              <option value="activity"${activitiesFilters.source === "activity" ? " selected" : ""}>События CRM</option>
            </select>
          </div>
        </div>
        <div class="grid grid-4" style="gap:.75rem;margin-bottom:.75rem">
          <div><label>Раздел</label>
            <select id="act-section"><option value="">Все</option>
              ${(facets.sections || []).map(s => `<option value="${escapeHtml(s)}"${activitiesFilters.section === s ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
            </select>
          </div>
          <div><label>Подраздел</label>
            <select id="act-subsection"><option value="">Все</option>
              ${(facets.subsections || []).map(s => `<option value="${escapeHtml(s)}"${activitiesFilters.subsection === s ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
            </select>
          </div>
          <div><label>Сделка (ID)</label><input type="text" id="act-deal" placeholder="D-001" value="${escapeHtml(activitiesFilters.dealId || "")}"></div>
          <div><label>Поиск</label><input type="search" id="act-q" placeholder="текст в записях…" value="${escapeHtml(activitiesFilters.q || "")}"></div>
        </div>
        <div class="act-score-filter-block" style="margin-bottom:.75rem;padding:.65rem .75rem;background:#f8fafc;border-radius:var(--radius);border:1px solid #edf2f7">
          <div class="grid grid-4" style="gap:.75rem;align-items:end">
            <div>
              <label>Влияние на скоринг</label>
              <select id="act-score-dir">
                <option value=""${!scoreDir ? " selected" : ""}>Все записи</option>
                <option value="changed"${scoreDir === "changed" ? " selected" : ""}>Любое изменение</option>
                <option value="up"${scoreDir === "up" ? " selected" : ""}>Увеличился</option>
                <option value="down"${scoreDir === "down" ? " selected" : ""}>Уменьшился</option>
                <option value="zero"${scoreDir === "zero" ? " selected" : ""}>Без изменения (0)</option>
                <option value="none"${scoreDir === "none" ? " selected" : ""}>Без влияния / пусто</option>
              </select>
            </div>
            <div style="grid-column: span 3" id="act-score-range-host"${scoreDir !== "up" && scoreDir !== "down" ? " hidden" : ""}>
              ${renderScoreImpactRangeInputs(scoreDir, activitiesFilters.scoreImpactFrom, activitiesFilters.scoreImpactTo)}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button type="button" class="btn btn-primary btn-sm" id="act-apply">Применить</button>
          <button type="button" class="btn btn-sm" id="act-reset">Сбросить</button>
          <span class="muted">Найдено: <strong>${total}</strong></span>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Журнал активностей</div>
      <div class="card-body" id="activities-body">${renderActivitiesTable(activitiesData?.items || [])}</div>
    </div>`;

  page.querySelector("#act-apply")?.addEventListener("click", () => {
    activitiesFilters = readActivitiesFiltersFromForm(page);
    loadActivities();
  });
  page.querySelector("#act-reset")?.addEventListener("click", () => {
    activitiesFilters = {
      from: defaultActivitiesFrom(),
      to: defaultActivitiesTo(),
      user: "", section: "", subsection: "", dealId: "", source: "all", q: "",
      scoreImpactDir: "", scoreImpactFrom: "", scoreImpactTo: "",
    };
    loadActivities();
  });
  page.querySelector("#act-score-dir")?.addEventListener("change", () => syncScoreRangeVisibility(page));
  requestAnimationFrame(() => initActivitiesTableResize());
}

function renderActivitiesPage() {
  if (typeof isAdmin === "function" && !isAdmin()) {
    const page = document.getElementById("page-activities");
    if (page) page.innerHTML = `<div class="card"><div class="card-body muted">Раздел доступен только администраторам.</div></div>`;
    return;
  }
  if (!activitiesFilters.from) activitiesFilters.from = defaultActivitiesFrom();
  if (!activitiesFilters.to) activitiesFilters.to = defaultActivitiesTo();
  renderActivities();
  if (!activitiesData && !activitiesLoading) loadActivities();
  bindActivitiesPageEvents();
}

function bindActivitiesPageEvents() {
  const page = document.getElementById("page-activities");
  if (!page || page.dataset.actBound) return;
  page.dataset.actBound = "1";
  page.addEventListener("click", e => {
    const th = e.target.closest("[data-act-sort]");
    if (th) {
      e.preventDefault();
      const key = th.dataset.actSort;
      if (activitiesSort.key === key) {
        activitiesSort.dir = activitiesSort.dir === "asc" ? "desc" : "asc";
      } else {
        activitiesSort = { key, dir: key === "at" ? "desc" : "asc" };
      }
      const body = document.getElementById("activities-body");
      if (body) {
        body.innerHTML = renderActivitiesTable(activitiesData?.items || []);
        requestAnimationFrame(() => initActivitiesTableResize());
      }
      return;
    }
    const drill = e.target.closest(".dash-drill-row");
    if (!drill || typeof openDealsReport !== "function" || typeof drillSpecFromElement !== "function") return;
    e.preventDefault();
    openDealsReport(drillSpecFromElement(drill));
  });
}
