/* Канбан по стадиям */
let kanbanStages = null;
let kanbanFilters = { q: "", fields: {} };
let kanbanFilterDraft = { field: "", values: [] };
let kanbanFilterPanelOpen = false;

async function loadKanbanStages() {
  const all = typeof pipelineStageOptions === "function"
    ? pipelineStageOptions()
    : (state?.lists?.stages || []);
  try {
    const { stages } = await apiKanbanConfig();
    if (Array.isArray(stages) && stages.length) {
      return stages.filter(s => all.includes(s));
    }
  } catch (_) { /* offline */ }
  return all;
}

function kanbanFilteredDeals() {
  const deals = (state?.deals || []).filter(d => !d.archived);
  if (typeof dealMatchesKanbanFilters === "function") {
    return deals.filter(d => dealMatchesKanbanFilters(d, kanbanFilters));
  }
  return deals;
}

function kanbanActiveFilterCount() {
  return Object.values(kanbanFilters.fields || {}).filter(v => v?.length).length;
}

function kanbanColSummary(col) {
  const count = col.length;
  const sum = col.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return { count, sum };
}

function renderKanbanFilterChips() {
  const fields = kanbanFilters.fields || {};
  const cols = typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : [];
  const chips = [];
  for (const [key, vals] of Object.entries(fields)) {
    if (!vals?.length) continue;
    const label = cols.find(c => c.key === key)?.label || key;
    chips.push(`<span class="kanban-filter-chip" data-field="${escapeHtml(key)}">${escapeHtml(label)}: ${vals.length} <button type="button" class="kanban-chip-x" data-field="${escapeHtml(key)}">✕</button></span>`);
  }
  return chips.join("") || `<span class="muted">Фильтры не заданы</span>`;
}

function renderKanbanFilterPanel() {
  const cols = typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : [];
  const deals = (state?.deals || []).filter(d => !d.archived);
  const field = kanbanFilterDraft.field || cols[0]?.key || "";
  const col = cols.find(c => c.key === field);
  const options = col && typeof getDistinctDealColValues === "function"
    ? getDistinctDealColValues(col, deals)
    : [];
  const selected = new Set(kanbanFilterDraft.values || []);

  return `<div class="kanban-filter-panel card" id="kanban-filter-panel">
    <div class="card-body">
      <h4>Фильтры канбана</h4>
      <p class="muted">Выберите поле сделки, отметьте значения и нажмите «Показать»</p>
      <div class="kanban-filter-steps">
        <div class="kanban-filter-step">
          <label>Поле</label>
          <select id="kanban-filter-field">${cols.map(c =>
            `<option value="${c.key}"${field === c.key ? " selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
          </select>
        </div>
        <div class="kanban-filter-step kanban-filter-values">
          <label>Значения <span class="muted">(${options.length})</span></label>
          <div class="kanban-filter-ms-actions">
            <button type="button" class="btn btn-sm" id="kanban-ms-all">Все</button>
            <button type="button" class="btn btn-sm" id="kanban-ms-none">Снять</button>
          </div>
          <div class="kanban-filter-ms-list" id="kanban-filter-ms-list">
            ${options.map(o => `<label class="kanban-ms-opt"><input type="checkbox" class="kanban-ms-cb" value="${escapeHtml(o)}"${selected.has(o) ? " checked" : ""}> ${escapeHtml(o)}</label>`).join("")}
          </div>
        </div>
      </div>
      <div class="kanban-filter-active">
        <span class="muted">Активные:</span> ${renderKanbanFilterChips()}
      </div>
      <div class="kanban-filter-actions">
        <button type="button" class="btn btn-primary btn-sm" id="kanban-filter-apply">Показать</button>
        <button type="button" class="btn btn-sm" id="kanban-filter-add">Добавить фильтр</button>
        <button type="button" class="btn btn-sm" id="kanban-filter-reset">Сбросить все</button>
        <button type="button" class="btn btn-sm" id="kanban-filter-close">Закрыть</button>
      </div>
    </div>
  </div>`;
}

function bindKanbanFilterPanel() {
  document.getElementById("kanban-filter-field")?.addEventListener("change", e => {
    kanbanFilterDraft.field = e.target.value;
    kanbanFilterDraft.values = kanbanFilters.fields?.[e.target.value] || [];
    const host = document.getElementById("kanban-filter-host");
    if (host) host.innerHTML = renderKanbanFilterPanel();
    bindKanbanFilterPanel();
  });
  document.getElementById("kanban-ms-all")?.addEventListener("click", () => {
    document.querySelectorAll(".kanban-ms-cb").forEach(cb => { cb.checked = true; });
  });
  document.getElementById("kanban-ms-none")?.addEventListener("click", () => {
    document.querySelectorAll(".kanban-ms-cb").forEach(cb => { cb.checked = false; });
  });
  document.getElementById("kanban-filter-add")?.addEventListener("click", () => {
    const field = document.getElementById("kanban-filter-field")?.value;
    const values = [...document.querySelectorAll(".kanban-ms-cb:checked")].map(cb => cb.value);
    if (!field || !values.length) return alert("Выберите поле и хотя бы одно значение");
    if (!kanbanFilters.fields) kanbanFilters.fields = {};
    kanbanFilters.fields[field] = values;
    kanbanFilterDraft = { field, values: [...values] };
    renderKanbanBoardOnly();
    const host = document.getElementById("kanban-filter-host");
    if (host) {
      host.innerHTML = renderKanbanFilterPanel();
      bindKanbanFilterPanel();
    }
    showToast("Фильтр добавлен");
  });
  document.getElementById("kanban-filter-apply")?.addEventListener("click", () => {
    const field = document.getElementById("kanban-filter-field")?.value;
    const values = [...document.querySelectorAll(".kanban-ms-cb:checked")].map(cb => cb.value);
    if (field && values.length) {
      if (!kanbanFilters.fields) kanbanFilters.fields = {};
      kanbanFilters.fields[field] = values;
    }
    kanbanFilterPanelOpen = false;
    renderKanban();
    showToast("Фильтры применены");
  });
  document.getElementById("kanban-filter-reset")?.addEventListener("click", () => {
    kanbanFilters.fields = {};
    kanbanFilterDraft = { field: kanbanFilterDraft.field, values: [] };
    renderKanban();
  });
  document.getElementById("kanban-filter-close")?.addEventListener("click", () => {
    kanbanFilterPanelOpen = false;
    document.getElementById("kanban-filter-host").innerHTML = "";
  });
  document.querySelectorAll(".kanban-chip-x").forEach(btn => {
    btn.onclick = () => {
      delete kanbanFilters.fields[btn.dataset.field];
      renderKanban();
    };
  });
}

function renderKanbanBoardOnly() {
  const board = document.getElementById("kanban-board");
  if (!board || !kanbanStages) return;
  const deals = kanbanFilteredDeals();
  board.innerHTML = kanbanStages.map(st => {
    const col = deals.filter(d => d.stage === st);
    const { count, sum } = kanbanColSummary(col);
    return `<div class="kanban-col" data-stage="${escapeHtml(st)}">
      <div class="kanban-col-head">
        <span>${escapeHtml(st)}</span>
        <div class="kanban-col-stats">
          <span class="badge">${count}</span>
          <span class="kanban-col-sum muted">${formatMoney(sum)}</span>
        </div>
      </div>
      <div class="kanban-col-body" data-stage="${escapeHtml(st)}">
        ${col.map(d => kanbanCard(d)).join("")}
      </div>
    </div>`;
  }).join("");
  bindKanbanDnD();
  const chips = document.querySelector(".kanban-active-chips");
  if (chips) chips.innerHTML = renderKanbanFilterChips();
}

async function renderKanban() {
  const el = document.getElementById("page-kanban");
  if (!el) return;
  kanbanStages = await loadKanbanStages();
  const deals = kanbanFilteredDeals();
  const admin = typeof isAdmin === "function" && isAdmin();
  const filterCount = kanbanActiveFilterCount();
  const cols = typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : [];
  if (!kanbanFilterDraft.field && cols[0]) {
    kanbanFilterDraft.field = cols[0].key;
    kanbanFilterDraft.values = kanbanFilters.fields?.[cols[0].key] || [];
  }

  el.innerHTML = `
    <div class="kanban-toolbar">
      <input type="search" id="kanban-search" class="kanban-search" placeholder="Быстрый поиск…" value="${escapeHtml(kanbanFilters.q)}">
      <button type="button" class="btn btn-sm${kanbanFilterPanelOpen ? " btn-primary" : ""}" id="kanban-filters-btn">🔍 Фильтры${filterCount ? ` (${filterCount})` : ""}</button>
      ${admin ? `<button type="button" class="btn btn-sm" id="kanban-config-btn">⚙ Столбцы</button>` : ""}
      <div class="kanban-active-chips">${renderKanbanFilterChips()}</div>
      <span class="muted kanban-hint">Перетащите карточку для смены стадии · ${deals.length} сделок</span>
      <button type="button" class="btn btn-sm" onclick="openDealModal()">+ Сделка</button>
    </div>
    <div id="kanban-filter-host">${kanbanFilterPanelOpen ? renderKanbanFilterPanel() : ""}</div>
    <div class="kanban-board" id="kanban-board">
      ${kanbanStages.map(st => {
        const col = deals.filter(d => d.stage === st);
        const { count, sum } = kanbanColSummary(col);
        return `<div class="kanban-col" data-stage="${escapeHtml(st)}">
          <div class="kanban-col-head">
            <span>${escapeHtml(st)}</span>
            <div class="kanban-col-stats">
              <span class="badge">${count}</span>
              <span class="kanban-col-sum muted">${formatMoney(sum)}</span>
            </div>
          </div>
          <div class="kanban-col-body" data-stage="${escapeHtml(st)}">
            ${col.map(d => kanbanCard(d)).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>
    ${admin ? `<div id="kanban-config-panel" class="kanban-config-panel" hidden></div>` : ""}`;

  document.getElementById("kanban-search")?.addEventListener("input", e => {
    kanbanFilters.q = e.target.value;
    renderKanbanBoardOnly();
  });
  document.getElementById("kanban-filters-btn")?.addEventListener("click", () => {
    kanbanFilterPanelOpen = !kanbanFilterPanelOpen;
    const host = document.getElementById("kanban-filter-host");
    if (!host) return;
    if (kanbanFilterPanelOpen) {
      host.innerHTML = renderKanbanFilterPanel();
      bindKanbanFilterPanel();
    } else {
      host.innerHTML = "";
    }
    document.getElementById("kanban-filters-btn")?.classList.toggle("btn-primary", kanbanFilterPanelOpen);
  });
  if (kanbanFilterPanelOpen) bindKanbanFilterPanel();
  document.getElementById("kanban-config-btn")?.addEventListener("click", () => openKanbanConfigPanel());
  bindKanbanDnD();
}

function openKanbanConfigPanel() {
  const panel = document.getElementById("kanban-config-panel");
  if (!panel) return;
  const all = typeof pipelineStageOptions === "function"
    ? pipelineStageOptions()
    : (state?.lists?.stages || []);
  const visible = new Set(kanbanStages || all);
  const hidden = all.filter(s => !visible.has(s));
  panel.hidden = false;
  panel.innerHTML = `
    <div class="card"><div class="card-body">
      <h4>Настройка столбцов канбана</h4>
      <p class="muted">Перетащите для смены порядка. Снимите галочку, чтобы скрыть столбец.</p>
      <ul class="kanban-config-list" id="kanban-config-list">
        ${(kanbanStages || all).map(st => `<li draggable="true" data-stage="${escapeHtml(st)}">
          <span class="drag-handle">☰</span>
          <label><input type="checkbox" class="kanban-col-vis" checked> ${escapeHtml(st)}</label>
        </li>`).join("")}
        ${hidden.map(st => `<li draggable="true" data-stage="${escapeHtml(st)}" class="hidden-col">
          <span class="drag-handle">☰</span>
          <label><input type="checkbox" class="kanban-col-vis"> ${escapeHtml(st)}</label>
        </li>`).join("")}
      </ul>
      <div style="margin-top:1rem;display:flex;gap:.5rem">
        <button type="button" class="btn btn-primary btn-sm" id="kanban-config-save">Сохранить</button>
        <button type="button" class="btn btn-sm" id="kanban-config-cancel">Отмена</button>
      </div>
    </div></div>`;
  bindKanbanConfigDnD();
  document.getElementById("kanban-config-save").onclick = async () => {
    const stages = [...document.querySelectorAll("#kanban-config-list li")]
      .filter(li => li.querySelector(".kanban-col-vis")?.checked)
      .map(li => li.dataset.stage);
    if (!stages.length) return alert("Нужен хотя бы один столбец");
    try {
      await apiSaveKanbanConfig(stages);
      kanbanStages = stages;
      panel.hidden = true;
      showToast("Столбцы канбана сохранены");
      renderKanban();
    } catch (e) { alert(e.message); }
  };
  document.getElementById("kanban-config-cancel").onclick = () => { panel.hidden = true; };
}

function bindKanbanConfigDnD() {
  let dragged = null;
  document.querySelectorAll("#kanban-config-list li").forEach(li => {
    li.addEventListener("dragstart", () => { dragged = li; });
    li.addEventListener("dragover", e => { e.preventDefault(); });
    li.addEventListener("drop", e => {
      e.preventDefault();
      if (!dragged || dragged === li) return;
      const list = document.getElementById("kanban-config-list");
      const items = [...list.children];
      const from = items.indexOf(dragged);
      const to = items.indexOf(li);
      if (from < to) li.after(dragged);
      else li.before(dragged);
    });
  });
}

function kanbanCard(d) {
  const canEdit = canEditDeal(d);
  return `<div class="kanban-card" draggable="${canEdit}" data-id="${escapeHtml(d.id)}" onclick="openDealById('${escapeHtml(d.id)}')">
    <div class="kanban-card-title">${escapeHtml(d.customer || "—")}</div>
    <div class="kanban-card-meta"><span class="badge ${categoryBadgeClass(d.category)}">${escapeHtml(d.category)}</span>
      <span class="muted owner-inline">${typeof ownerAvatarHtml === "function" ? ownerAvatarHtml(d.owner) : ""}${escapeHtml(d.owner || "")}</span></div>
    <div class="kanban-card-amt">${formatMoney(d.amount || 0)}</div>
  </div>`;
}

function openDealById(id) {
  const idx = (state.deals || []).findIndex(d => d.id === id);
  if (idx >= 0) openDealModal(idx);
}

function bindKanbanDnD() {
  let dragged = null;
  document.querySelectorAll(".kanban-card").forEach(card => {
    card.addEventListener("dragstart", e => { dragged = card; e.dataTransfer.effectAllowed = "move"; });
    card.addEventListener("dragend", () => { dragged = null; });
  });
  document.querySelectorAll(".kanban-col-body").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      if (!dragged) return;
      const dealId = dragged.dataset.id;
      const newStage = col.dataset.stage;
      const idx = state.deals.findIndex(d => d.id === dealId);
      if (idx < 0) return;
      const deal = { ...state.deals[idx], stage: newStage };
      if (!canEditDeal(deal)) { alert("Нет прав на редактирование"); return; }
      try {
        state.deals[idx] = deal;
        const res = await apiSaveDeal(deal);
        if (res.deal) state.deals[idx] = migrateDeal(res.deal);
        persistStateCache(state);
        renderKanbanBoardOnly();
        showToast(`Стадия → ${newStage}`);
      } catch (err) {
        alert(err.message);
        renderKanbanBoardOnly();
      }
    });
  });
}

window.renderKanban = renderKanban;
window.openDealById = openDealById;
