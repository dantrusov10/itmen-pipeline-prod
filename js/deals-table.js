/* Таблица сделок — сортировка и фильтрация по каждому столбцу */
const DEALS_TABLE_COLS = [
  {
    key: "customer",
    label: "Клиент / стадия",
    filter: "text",
    get: d => `${d.customer} ${d.stage}`,
    render(d) {
      return `<td class="col-customer">
        <strong>${escapeHtml(d.customer)}</strong>
        <div class="cell-sub">${escapeHtml(d.stage)}</div>
      </td>`;
    },
  },
  {
    key: "owner",
    label: "Владелец",
    filter: "select-dynamic",
    get: d => d.owner,
    render(d) {
      return `<td>${escapeHtml(d.owner)}</td>`;
    },
  },
  {
    key: "amount",
    label: "Ожид. сумма",
    num: true,
    filter: "text",
    get: d => d.amount,
    render(d) {
      return `<td class="num col-amount">
        ${formatMoney(d.amount)}
        <div class="cell-sub">${d.weighted ? formatMoney(d.weighted) + " взв." : "—"}</div>
      </td>`;
    },
  },
  {
    key: "score",
    label: "Балл",
    num: true,
    filter: "text",
    get: d => d.score,
    render(d) {
      return `<td class="num">${d.score ?? "—"}</td>`;
    },
  },
  {
    key: "category",
    label: "Категория",
    filter: "select",
    filterOptions: ["Горячая", "Тёплая", "Наблюдение", "Отказ"],
    get: d => d.category,
    render(d) {
      return `<td>${categoryBadge(d.category)}</td>`;
    },
  },
  {
    key: "taskDue",
    label: "Задача до",
    date: true,
    filter: "text",
    get: d => d.taskDue,
    render(d) {
      const days = d.daysTo != null
        ? `<span class="cell-days ${d.daysTo < 0 ? "overdue" : ""}">${d.daysTo} дн.</span>`
        : "";
      return `<td class="col-date">${escapeHtml(d.taskDue || "—")}${days ? `<br>${days}` : ""}</td>`;
    },
  },
  {
    key: "risk",
    label: "Риск",
    filter: "select",
    filterOptions: ["Неполный", "Устарела (>14 дн.)", "Горячая без бюджета", "—"],
    get: d => d.riskFlag || (d.quality === "Неполный" ? "Неполный" : "—"),
    render(d) {
      if (d.riskFlag) {
        return `<td><span class="badge badge-danger badge-compact" title="${escapeHtml(d.riskFlag)}">${escapeHtml(d.riskFlag.length > 18 ? d.riskFlag.slice(0, 16) + "…" : d.riskFlag)}</span></td>`;
      }
      if (d.quality === "Неполный") {
        return `<td><span class="badge badge-warn badge-compact">Неполный</span></td>`;
      }
      return `<td class="muted">—</td>`;
    },
  },
];

let dealsTableSort = { key: "amount", dir: "desc" };
let dealsTableColFilters = {};
let dealsTableSearch = "";
let dealsTableBound = false;

function dealCellText(col, d) {
  const v = col.get(d);
  if (v == null || v === "") return "";
  return String(v);
}

function colSortValue(col, d) {
  const v = col.get(d);
  if (col.num) {
    if (v == null || v === "") return null;
    return +v;
  }
  if (col.date) return v || "";
  return dealCellText(col, d).toLowerCase();
}

function matchColFilter(col, d, filterVal) {
  const f = (filterVal || "").trim();
  if (!f) return true;
  if (col.filter === "select" || col.filter === "select-dynamic") {
    const cell = dealCellText(col, d);
    if (f === "—") return !cell || cell === "—";
    return cell === f || (f === "Неполный" && d.quality === "Неполный" && !d.riskFlag);
  }
  if (col.num) {
    const raw = dealCellText(col, d).replace(/\s/g, "");
    const fv = f.replace(/\s/g, "");
    if (/^\d+$/.test(fv)) return raw.includes(fv);
    return raw.toLowerCase().includes(fv.toLowerCase());
  }
  return dealCellText(col, d).toLowerCase().includes(f.toLowerCase());
}

function applyDealsTableFilters(deals) {
  let rows = deals;
  for (const col of DEALS_TABLE_COLS) {
    const f = dealsTableColFilters[col.key];
    if (f) rows = rows.filter(d => matchColFilter(col, d, f));
  }
  const search = (dealsTableSearch || "").trim().toLowerCase();
  if (search) {
    rows = rows.filter(d =>
      DEALS_TABLE_COLS.some(col => dealCellText(col, d).toLowerCase().includes(search))
    );
  }
  return rows;
}

function sortDealsTableRows(deals) {
  const col = DEALS_TABLE_COLS.find(c => c.key === dealsTableSort.key) || DEALS_TABLE_COLS[2];
  const dir = dealsTableSort.dir === "asc" ? 1 : -1;
  return [...deals].sort((a, b) => {
    const av = colSortValue(col, a);
    const bv = colSortValue(col, b);
    if (col.num) {
      const an = av == null ? -Infinity : av;
      const bn = bv == null ? -Infinity : bv;
      return (an - bn) * dir;
    }
    if (col.date) {
      const ad = av || "";
      const bd = bv || "";
      if (!ad && !bd) return 0;
      if (!ad) return 1 * dir;
      if (!bd) return -1 * dir;
      return ad.localeCompare(bd) * dir;
    }
    return String(av).localeCompare(String(bv), "ru") * dir;
  });
}

function renderColFilter(col, deals) {
  const val = escapeHtml(dealsTableColFilters[col.key] || "");
  if (col.filter === "select" || col.filter === "select-dynamic") {
    const options = col.filter === "select-dynamic"
      ? [...new Set((deals || []).map(d => col.get(d)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"))
      : (col.filterOptions || []);
    const opts = options.map(o =>
      `<option value="${escapeHtml(o)}" ${dealsTableColFilters[col.key] === o ? "selected" : ""}>${escapeHtml(o)}</option>`
    ).join("");
    return `<select class="deals-col-filter" data-col="${col.key}"><option value="">Все</option>${opts}</select>`;
  }
  return `<input type="search" class="deals-col-filter" data-col="${col.key}" placeholder="Фильтр…" value="${val}">`;
}

function renderDealsTableRow(d) {
  const realIdx = state.deals.findIndex(x => x.id === d.id);
  const cls = d.quality === "Неполный" ? "row-incomplete" : d.riskFlag ? "row-risk" : "";
  return `<tr class="${cls}" data-id="${escapeHtml(d.id)}">
    ${DEALS_TABLE_COLS.map(c => c.render(d)).join("")}
    <td class="actions">
      <button class="btn btn-sm" onclick="openDealModal(${realIdx})" title="Редактировать">✏️</button>
      <button class="btn btn-sm btn-danger" onclick="deleteDeal(${realIdx})" title="Удалить">🗑</button>
    </td>
  </tr>`;
}

function sortMarkHtml(key) {
  const active = dealsTableSort.key === key;
  const icon = active ? (dealsTableSort.dir === "asc" ? "▲" : "▼") : "⇅";
  return `<span class="sort-mark${active ? " active" : ""}">${icon}</span>`;
}

function renderSortHeader(col) {
  const active = dealsTableSort.key === col.key;
  return `<th data-sort="${col.key}" class="sortable${active ? " sorted-" + dealsTableSort.dir : ""}" title="Сортировка: клик — по возрастанию/убыванию">
    <span class="th-label">${escapeHtml(col.label)}</span>${sortMarkHtml(col.key)}
  </th>`;
}

function updateDealsTableSortMarks() {
  document.querySelectorAll("#deals-table th[data-sort]").forEach(el => {
    const key = el.dataset.sort;
    const col = DEALS_TABLE_COLS.find(c => c.key === key);
    const active = key === dealsTableSort.key;
    el.classList.toggle("sorted-asc", active && dealsTableSort.dir === "asc");
    el.classList.toggle("sorted-desc", active && dealsTableSort.dir === "desc");
    el.innerHTML = `<span class="th-label">${escapeHtml(col?.label || key)}</span>${sortMarkHtml(key)}`;
  });
}

function updateDealsTableBody(deals) {
  const tbody = document.getElementById("deals-tbody");
  const meta = document.getElementById("deals-table-meta");
  if (!tbody) return;
  const filtered = sortDealsTableRows(applyDealsTableFilters(deals));
  tbody.innerHTML = filtered.map(renderDealsTableRow).join("");
  if (meta) meta.textContent = `Показано ${filtered.length} из ${deals.length}`;
}

function bindDealsTableEvents() {
  if (dealsTableBound) return;
  dealsTableBound = true;
  const page = document.getElementById("page-deals");
  page?.addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    e.preventDefault();
    const key = th.dataset.sort;
    if (dealsTableSort.key === key) {
      dealsTableSort.dir = dealsTableSort.dir === "asc" ? "desc" : "asc";
    } else {
      dealsTableSort = { key, dir: (DEALS_TABLE_COLS.find(c => c.key === key)?.num ? "desc" : "asc") };
    }
    updateDealsTableSortMarks();
    updateDealsTableBody(getEnrichedDeals());
  });
  page?.addEventListener("input", e => {
    if (e.target.id === "deals-global-search") {
      dealsTableSearch = e.target.value;
      updateDealsTableBody(getEnrichedDeals());
    }
    if (e.target.classList.contains("deals-col-filter") && e.target.tagName === "INPUT") {
      dealsTableColFilters[e.target.dataset.col] = e.target.value;
      updateDealsTableBody(getEnrichedDeals());
    }
  });
  page?.addEventListener("change", e => {
    if (e.target.classList.contains("deals-col-filter") && e.target.tagName === "SELECT") {
      dealsTableColFilters[e.target.dataset.col] = e.target.value;
      updateDealsTableBody(getEnrichedDeals());
    }
  });
  page?.addEventListener("click", e => {
    if (e.target.id === "deals-clear-filters") {
      dealsTableColFilters = {};
      dealsTableSearch = "";
      const gs = document.getElementById("deals-global-search");
      if (gs) gs.value = "";
      document.querySelectorAll(".deals-col-filter").forEach(el => { el.value = ""; });
      updateDealsTableBody(getEnrichedDeals());
    }
  });
}

function renderDealsTable(deals) {
  const el = document.getElementById("page-deals");
  if (!el) return;
  dealsTableBound = false;
  el.innerHTML = `
    <div class="deals-toolbar">
      <button class="btn btn-primary" onclick="openDealModal()">+ Добавить</button>
      <label class="btn" style="cursor:pointer">⬆️ Excel<input type="file" id="btn-import-excel" accept=".xlsx,.xls" hidden></label>
      <input type="search" id="deals-global-search" class="deals-global-search" placeholder="Быстрый поиск по всем столбцам…" value="${escapeHtml(dealsTableSearch)}">
      <button type="button" class="btn btn-sm" id="deals-clear-filters">Сбросить фильтры</button>
      <span class="deals-table-meta" id="deals-table-meta"></span>
    </div>
    <div class="deals-table-shell">
      <table class="deals-table deals-table-compact" id="deals-table">
        <thead>
          <tr>${DEALS_TABLE_COLS.map(c => renderSortHeader(c)).join("")}<th class="col-actions"></th></tr>
          <tr class="deals-filter-row">${DEALS_TABLE_COLS.map(c =>
            `<th>${renderColFilter(c, deals)}</th>`
          ).join("")}<th></th></tr>
        </thead>
        <tbody id="deals-tbody"></tbody>
      </table>
    </div>`;

  document.getElementById("btn-import-excel")?.addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) importExcelFile(f);
    e.target.value = "";
  });

  bindDealsTableEvents();
  updateDealsTableBody(deals);
}
