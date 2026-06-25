/* Конструктор отчётов */
let reportState = { entity: "deals", columns: [], filters: {}, groupBy: "", chartType: "bar" };

const REPORT_ENTITY_LABELS = {
  deals: "Сделки",
  tasks: "Задачи",
  activities: "События",
  contacts: "Контакты",
  files: "Файлы",
  deal_info: "Информация по клиенту",
};

const REPORT_FIELD_LABELS = {
  id: "ID",
  customer: "Клиент",
  owner: "Владелец",
  stage: "Стадия",
  industry: "Отрасль",
  amount: "Ожид. сумма",
  expectedBudget: "Ожид. бюджет",
  partner: "Партнёр",
  budgetStatus: "Статус бюджета",
  budgetPeriod: "Период бюджета",
  taskDue: "Срок задачи",
  lossReason: "Причина отказа",
  archived: "В архиве",
  dealId: "ID сделки",
  description: "Описание",
  doneAt: "Выполнено",
  reminderAt: "Напоминание",
  createdBy: "Создал",
  authorEmail: "Email автора",
  name: "ФИО",
  email: "Email",
  phone: "Телефон",
  role: "Роль",
  isPrimary: "Основной",
  label: "Метка",
  originalName: "Имя файла",
  size: "Размер",
  uploadedBy: "Загрузил",
  uploadedAt: "Дата загрузки",
  companyName: "Название ЮЛ",
  companyInn: "ИНН",
  companyKpp: "КПП",
  companyOgrn: "ОГРН",
  website: "Сайт",
  sourceChannel: "Канал",
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  landingPage: "Лендинг",
  referrer: "Referrer",
  partnerDiscount: "Скидка партнёру",
  clientDiscount: "Скидка клиенту",
  manualProb: "Вероятность",
  budgetPlannedMonth: "Месяц согласования",
  budgetPlannedYear: "Год согласования",
  pains: "Боли",
  capabilities: "Возможности",
  dml: "DML",
  nextStepType: "Тип след. шага",
  nextStepComment: "Коммент. след. шага",
  riskType: "Тип риска",
  riskComment: "Комм. риска",
  competitors: "Конкуренты",
  amoId: "ID amoCRM",
  lastUpdate: "Обновлено",
  dealType: "Тип сделки",
  hasPains: "Есть боли",
  duplicate_of: "Дубликат",
  score: "Балл",
  category: "Категория",
  weighted: "Взвеш. сумма",
  quality: "Качество паспорта",
  daysTo: "Дней до задачи",
  daysSince: "Дней с обновления",
  commitLabel: "Коммит (текст)",
  riskFlag: "Флаг риска",
  productPct: "% продукта",
  pilotPct: "% пилота",
  title: "Название",
  assignee: "Ответственный",
  dueAt: "Срок",
  status: "Статус",
  type: "Тип",
  body: "Текст",
  author: "Автор",
  at: "Дата",
};

const REPORT_NUMERIC_FIELDS = new Set([
  "amount", "expectedBudget", "partnerDiscount", "clientDiscount", "manualProb",
  "score", "weighted", "daysTo", "daysSince", "productPct", "pilotPct", "size",
  "budgetPlannedMonth", "budgetPlannedYear",
]);

function reportFieldFilterType(field) {
  if (REPORT_NUMERIC_FIELDS.has(field)) return "range";
  if (field === "archived" || field === "hasPains" || field === "isPrimary") return "bool";
  return "multiselect";
}

function reportDistinctValues(entity, field) {
  if (entity === "deals" && state?.deals) {
    const set = new Set();
    (state.deals || []).forEach(d => {
      const en = typeof enrichDeal === "function" ? enrichDeal(d) : d;
      let v = en[field];
      if (field === "commitLabel") v = typeof commitLabel === "function" ? commitLabel(en.commitStatus) : v;
      set.add(String(v ?? "—"));
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }
  const listMap = {
    owner: state?.lists?.owners,
    stage: typeof pipelineStageOptions === "function" ? pipelineStageOptions() : state?.lists?.stages,
    industry: state?.lists?.industries,
    partner: state?.lists?.partners,
    budgetStatus: state?.lists?.budgetStatus,
    budgetPeriod: state?.lists?.budgetPeriods,
    status: ["open", "done", "cancelled"],
    type: ["comment", "stage_change", "task_created", "task_done", "file_uploaded"],
  };
  if (listMap[field]) return listMap[field];
  return [];
}

function renderReportFilterCell(entity, field, filters) {
  const type = reportFieldFilterType(field);
  if (type === "range") {
    return `<div class="rep-filter-range inline">
      <input type="number" class="rep-f-from" data-field="${field}" placeholder="от" value="${escapeHtml(filters[`${field}__from`] ?? "")}">
      <span class="muted">—</span>
      <input type="number" class="rep-f-to" data-field="${field}" placeholder="до" value="${escapeHtml(filters[`${field}__to`] ?? "")}">
    </div>`;
  }
  if (type === "bool") {
    return `<select class="rep-f-bool" data-field="${field}">
      <option value="">Все</option>
      <option value="1"${filters[field] === "1" || filters[field] === true ? " selected" : ""}>Да</option>
      <option value="0"${filters[field] === "0" || filters[field] === false ? " selected" : ""}>Нет</option>
    </select>`;
  }
  const options = reportDistinctValues(entity, field);
  const sel = new Set(Array.isArray(filters[field]) ? filters[field] : []);
  const label = sel.size ? `${sel.size} выбр.` : "Все";
  const open = reportState.filterExpanded === field;
  return `<div class="rep-ms-filter${open ? " open" : ""}" data-field="${field}">
    <button type="button" class="btn btn-sm rep-ms-toggle">${escapeHtml(label)} ▾</button>
    <div class="rep-ms-panel" ${open ? "" : "hidden"}>
      ${options.length ? `<div class="rep-filter-ms">${options.map(o =>
        `<label class="deals-ms-opt"><input type="checkbox" class="rep-f-cb" data-field="${field}" value="${escapeHtml(o)}"${sel.has(o) ? " checked" : ""}><span>${escapeHtml(o)}</span></label>`
      ).join("")}</div>` : `<span class="muted">Нет значений</span>`}
    </div>
  </div>`;
}

function renderReportUnifiedTable(entity, fields) {
  const filters = reportState.filters || {};
  const colSearch = reportState.colSearch || "";
  const filteredFields = colSearch
    ? fields.filter(f => reportFieldLabel(f).toLowerCase().includes(colSearch.toLowerCase()) || f.toLowerCase().includes(colSearch.toLowerCase()))
    : fields;
  const checked = reportState.checkedColumns || fields;
  const checkedSet = new Set(checked);
  return `<div class="rep-unified">
    <label>Атрибуты и фильтры <span class="muted">(${fields.length})</span></label>
    <input type="search" id="rep-col-search" class="rep-unified-search" placeholder="Поиск атрибута…" value="${escapeHtml(colSearch)}">
    <div class="rep-unified-table-wrap">
      <table class="rep-attr-table">
        <thead><tr><th class="rep-th-check"></th><th>Атрибут</th><th>Фильтр</th></tr></thead>
        <tbody>
          ${filteredFields.map(f => `<tr data-field="${f}">
            <td><input type="checkbox" class="rep-col-cb" value="${f}"${checkedSet.has(f) ? " checked" : ""}></td>
            <td class="rep-attr-name">${escapeHtml(reportFieldLabel(f))}</td>
            <td class="rep-filter-cell">${renderReportFilterCell(entity, f, filters)}</td>
          </tr>`).join("")}
          ${!filteredFields.length ? `<tr><td colspan="3" class="muted">Ничего не найдено</td></tr>` : ""}
        </tbody>
      </table>
    </div>
  </div>`;
}

function collectReportFiltersFromDom() {
  const filters = { ...(reportState.filters || {}) };
  document.querySelectorAll(".rep-f-from").forEach(inp => {
    const k = `${inp.dataset.field}__from`;
    if (inp.value !== "") filters[k] = inp.value;
    else delete filters[k];
  });
  document.querySelectorAll(".rep-f-to").forEach(inp => {
    const k = `${inp.dataset.field}__to`;
    if (inp.value !== "") filters[k] = inp.value;
    else delete filters[k];
  });
  document.querySelectorAll(".rep-f-bool").forEach(sel => {
    if (sel.value !== "") filters[sel.dataset.field] = sel.value;
    else delete filters[sel.dataset.field];
  });
  const msFields = new Set([...document.querySelectorAll(".rep-f-cb")].map(cb => cb.dataset.field));
  msFields.forEach(field => {
    const vals = [...document.querySelectorAll(`.rep-f-cb[data-field="${field}"]:checked`)].map(cb => cb.value);
    if (vals.length) filters[field] = vals;
    else delete filters[field];
  });
  reportState.filters = filters;
  return filters;
}

function bindReportUnifiedEvents() {
  document.querySelectorAll(".rep-f-from, .rep-f-to").forEach(inp => {
    inp.oninput = () => collectReportFiltersFromDom();
  });
  document.querySelectorAll(".rep-f-bool").forEach(sel => {
    sel.onchange = () => collectReportFiltersFromDom();
  });
  document.querySelectorAll(".rep-f-cb").forEach(cb => {
    cb.onchange = () => {
      collectReportFiltersFromDom();
      const wrap = cb.closest(".rep-ms-filter");
      const n = wrap?.querySelectorAll(".rep-f-cb:checked").length || 0;
      const btn = wrap?.querySelector(".rep-ms-toggle");
      if (btn) btn.textContent = (n ? `${n} выбр.` : "Все") + " ▾";
    };
  });
  document.querySelectorAll(".rep-ms-toggle").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const wrap = btn.closest(".rep-ms-filter");
      if (!wrap) return;
      const opening = !wrap.classList.contains("open");
      document.querySelectorAll(".rep-ms-filter.open").forEach(el => {
        if (el !== wrap) {
          el.classList.remove("open");
          el.querySelector(".rep-ms-panel")?.setAttribute("hidden", "");
        }
      });
      wrap.classList.toggle("open", opening);
      const panel = wrap.querySelector(".rep-ms-panel");
      if (panel) panel.hidden = !opening;
      reportState.filterExpanded = opening ? wrap.dataset.field : null;
    };
  });
  document.querySelectorAll(".rep-col-cb").forEach(cb => {
    cb.onchange = () => {
      reportState.checkedColumns = [...document.querySelectorAll(".rep-col-cb:checked")].map(x => x.value);
    };
  });
}

function collectReportCheckedColumns() {
  const cols = [...document.querySelectorAll(".rep-col-cb:checked")].map(c => c.value);
  reportState.checkedColumns = cols;
  return cols;
}

function reportFieldLabel(key) {
  if (typeof getKanbanFilterCols === "function") {
    const col = getKanbanFilterCols().find(c => c.key === key);
    if (col?.label) return col.label;
  }
  return REPORT_FIELD_LABELS[key] || key;
}

function reportEntityLabel(key) {
  return REPORT_ENTITY_LABELS[key] || key;
}

async function renderReports() {
  const el = document.getElementById("page-reports");
  if (!el) return;
  el.innerHTML = `<div class="reports-layout">
    <div class="card"><div class="card-body" id="reports-builder"><p class="muted">Загрузка…</p></div></div>
    <div class="card"><div class="card-body" id="reports-result"></div></div>
  </div>`;
  await renderReportBuilder();
}

async function renderReportBuilder() {
  const box = document.getElementById("reports-builder");
  if (!box) return;
  try {
    const { entities } = await apiReportEntities();
    const { items: presets } = await apiListReportPresets();
    const presetList = presets || [];
    const fields = entities?.[reportState.entity] || [];
    if (!reportState.checkedColumns?.length) reportState.checkedColumns = [...fields];
    box.innerHTML = `
    <h3>Конструктор отчётов</h3>
    <div class="form-grid">
      <div><label>Сущность</label>
        <select id="rep-entity">${Object.keys(entities).map(e =>
          `<option value="${e}"${reportState.entity === e ? " selected" : ""}>${reportEntityLabel(e)}</option>`).join("")}
        </select></div>
      <div><label>Группировка</label>
        <select id="rep-group"><option value="">—</option>
          ${fields.map(f => `<option value="${f}"${reportState.groupBy === f ? " selected" : ""}>${reportFieldLabel(f)}</option>`).join("")}
        </select></div>
      <div><label>График</label>
        <select id="rep-chart">
          <option value="none">Нет</option>
          <option value="bar" ${reportState.chartType === "bar" ? "selected" : ""}>Столбцы</option>
          <option value="pie" ${reportState.chartType === "pie" ? "selected" : ""}>Круг</option>
        </select></div>
    </div>
    ${renderReportUnifiedTable(reportState.entity, fields)}
    <div style="margin-top:1rem;display:flex;gap:.5rem">
      <button type="button" class="btn btn-primary btn-sm" id="rep-run">Построить</button>
      <button type="button" class="btn btn-sm" id="rep-save">Сохранить пресет</button>
    </div>
    <div style="margin-top:1rem"><label>Пресеты</label>
      ${presetList.map(p => `<button type="button" class="btn btn-sm rep-preset" data-id="${p.id}">${escapeHtml(p.name)}</button>`).join(" ") || "<span class='muted'>нет</span>"}
    </div>`;
    document.getElementById("rep-entity").onchange = e => {
      reportState.entity = e.target.value;
      reportState.colSearch = "";
      reportState.checkedColumns = null;
      reportState.filterExpanded = null;
      renderReportBuilder();
    };
    document.getElementById("rep-col-search")?.addEventListener("input", e => {
      collectReportFiltersFromDom();
      collectReportCheckedColumns();
      reportState.colSearch = e.target.value;
      renderReportBuilder();
    });
    document.getElementById("rep-group").onchange = e => { reportState.groupBy = e.target.value; };
    document.getElementById("rep-chart").onchange = e => { reportState.chartType = e.target.value; };
    document.getElementById("rep-run").onclick = runCurrentReport;
    bindReportUnifiedEvents();
    document.getElementById("rep-save").onclick = async () => {
      const name = prompt("Название пресета");
      if (!name) return;
      collectReportFiltersFromDom();
      const columns = collectReportCheckedColumns();
      await apiSaveReportPreset({
        name, entity: reportState.entity, columns,
        groupBy: reportState.groupBy, chartType: reportState.chartType,
        filters: reportState.filters,
      });
      showToast("Пресет сохранён");
      renderReportBuilder();
    };
    box.querySelectorAll(".rep-preset").forEach(btn => {
      btn.onclick = async () => {
        const p = presetList.find(x => x.id === btn.dataset.id);
        if (!p) return;
        reportState.entity = p.entity;
        reportState.groupBy = p.groupBy;
        reportState.chartType = p.chartType;
        reportState.filters = p.filters || {};
        reportState.checkedColumns = p.columns || [];
        await renderReportBuilder();
        runCurrentReport();
      };
    });
  } catch (e) {
    box.innerHTML = `<h3>Конструктор отчётов</h3><p class="muted" style="color:#b45309">Ошибка загрузки: ${escapeHtml(e.message)}</p>
      <button type="button" class="btn btn-sm" onclick="renderReportBuilder()">Повторить</button>`;
  }
}

async function runCurrentReport() {
  collectReportFiltersFromDom();
  const columns = collectReportCheckedColumns();
  if (!columns.length) {
    showToast("Выберите хотя бы один атрибут");
    return;
  }
  const data = await apiRunReport({
    entity: reportState.entity,
    columns,
    filters: reportState.filters,
    groupBy: reportState.groupBy,
  });
  const res = document.getElementById("reports-result");
  if (!res) return;
  let html = `<h3>Результат (${data.total})</h3>`;
  if (data.grouped?.length && reportState.chartType !== "none") {
    html += renderSimpleChart(data.grouped, reportState.chartType);
  }
  if (data.rows?.length) {
    const cols = columns.length ? columns : Object.keys(data.rows[0]);
    html += `<div class="deals-table-shell"><table class="deals-table deals-table-compact" id="reports-result-table">
      <thead><tr>
      ${cols.map(c => `<th data-col="${escapeHtml(c)}">${escapeHtml(reportFieldLabel(c))}</th>`).join("")}</tr></thead><tbody>
      ${data.rows.slice(0, 200).map(r => `<tr>${cols.map(c => `<td>${escapeHtml(formatReportCell(c, r[c]))}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>`;
  } else {
    html += `<p class="muted">Нет данных</p>`;
  }
  res.innerHTML = html;
  if (typeof initTableColumnResize === "function") {
    const tbl = document.getElementById("reports-result-table");
    if (tbl) initTableColumnResize(tbl, "itmen_report_col_widths");
  }
}

function formatReportCell(key, val) {
  if (val == null || val === "") return "—";
  if (key === "archived") return val ? "Да" : "Нет";
  if (key === "amount" || key === "expectedBudget") return typeof formatMoney === "function" ? formatMoney(val) : val;
  return val;
}

function renderSimpleChart(grouped, type) {
  const max = Math.max(1, ...grouped.map(g => g.count));
  if (type === "pie") {
    const total = grouped.reduce((s, g) => s + g.count, 0) || 1;
    let acc = 0;
    const stops = grouped.map((g, i) => {
      const pct = (g.count / total) * 100;
      const c = `hsl(${(i * 47) % 360} 60% 50%)`;
      const out = `${c} ${acc}% ${acc + pct}%`;
      acc += pct;
      return out;
    });
    return `<div class="rep-chart-pie" style="background:conic-gradient(${stops.join(",")});width:160px;height:160px;border-radius:50%;margin:1rem 0"></div>
      <div>${grouped.map(g => `${escapeHtml(g.key)}: ${g.count}`).join(" · ")}</div>`;
  }
  return `<div class="rep-chart-bars">${grouped.map(g =>
    `<div class="rep-bar-row"><span>${escapeHtml(g.key)}</span>
      <div class="rep-bar"><div style="width:${Math.round(g.count / max * 100)}%"></div></div>
      <span>${g.count}</span></div>`).join("")}</div>`;
}

window.renderReports = renderReports;
window.reportFieldLabel = reportFieldLabel;
