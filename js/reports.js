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
};
  title: "Название",
  assignee: "Ответственный",
  dueAt: "Срок",
  status: "Статус",
  type: "Тип",
  body: "Текст",
  author: "Автор",
  at: "Дата",
};

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
    const colSearch = reportState.colSearch || "";
    const filteredFields = colSearch
      ? fields.filter(f => reportFieldLabel(f).toLowerCase().includes(colSearch.toLowerCase()) || f.toLowerCase().includes(colSearch.toLowerCase()))
      : fields;
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
    <div style="margin-top:1rem">
      <label>Колонки <span class="muted">(${fields.length} атрибутов)</span></label>
      <input type="search" id="rep-col-search" placeholder="Поиск атрибута…" value="${escapeHtml(colSearch)}" style="width:100%;max-width:320px;margin:.35rem 0 .5rem">
      <div class="rep-cols">${filteredFields.map(f =>
        `<label class="deals-ms-opt"><input type="checkbox" class="rep-col-cb" value="${f}" checked> ${reportFieldLabel(f)}</label>`).join("")}
      ${!filteredFields.length ? "<span class='muted'>Ничего не найдено</span>" : ""}
    </div>
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
      renderReportBuilder();
    };
    document.getElementById("rep-col-search")?.addEventListener("input", e => {
      reportState.colSearch = e.target.value;
      renderReportBuilder();
    });
    document.getElementById("rep-group").onchange = e => { reportState.groupBy = e.target.value; };
    document.getElementById("rep-chart").onchange = e => { reportState.chartType = e.target.value; };
    document.getElementById("rep-run").onclick = runCurrentReport;
    document.getElementById("rep-save").onclick = async () => {
      const name = prompt("Название пресета");
      if (!name) return;
      const columns = [...document.querySelectorAll(".rep-col-cb:checked")].map(c => c.value);
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
        await renderReportBuilder();
        [...document.querySelectorAll(".rep-col-cb")].forEach(cb => {
          cb.checked = (p.columns || []).includes(cb.value);
        });
        runCurrentReport();
      };
    });
  } catch (e) {
    box.innerHTML = `<h3>Конструктор отчётов</h3><p class="muted" style="color:#b45309">Ошибка загрузки: ${escapeHtml(e.message)}</p>
      <button type="button" class="btn btn-sm" onclick="renderReportBuilder()">Повторить</button>`;
  }
}

async function runCurrentReport() {
  const columns = [...document.querySelectorAll(".rep-col-cb:checked")].map(c => c.value);
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
    html += `<div class="deals-table-shell"><table class="deals-table deals-table-compact"><thead><tr>
      ${cols.map(c => `<th>${escapeHtml(reportFieldLabel(c))}</th>`).join("")}</tr></thead><tbody>
      ${data.rows.slice(0, 200).map(r => `<tr>${cols.map(c => `<td>${escapeHtml(formatReportCell(c, r[c]))}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>`;
  } else {
    html += `<p class="muted">Нет данных</p>`;
  }
  res.innerHTML = html;
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
