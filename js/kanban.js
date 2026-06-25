/* Канбан по стадиям */
let kanbanStages = null;
let kanbanFilters = {};
let kanbanFilterOpen = false;

async function loadKanbanStages() {
  const all = typeof pipelineStageOptions === "function"
    ? pipelineStageOptions()
    : (state?.lists?.stages || []);
  try {
    const { stages } = await apiKanbanConfig();
    if (Array.isArray(stages) && stages.length) {
      return stages;
    }
  } catch (_) { /* offline */ }
  return all;
}

function kanbanFilteredDeals() {
  const deals = (state?.deals || []).filter(d => !d.archived);
  const q = (kanbanFilters.q || "").trim().toLowerCase();
  let rows = deals;
  if (typeof dealMatchesAmoFilters === "function") {
    rows = rows.filter(d => dealMatchesAmoFilters(d, kanbanFilters));
  }
  if (q) {
    rows = rows.filter(d => {
      const hay = `${d.customer || ""} ${d.id || ""} ${d.owner || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return rows;
}

function kanbanColSummary(col) {
  return {
    count: col.length,
    sum: col.reduce((s, d) => s + (Number(d.amount) || 0), 0),
  };
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
  const meta = document.getElementById("kanban-meta");
  if (meta) meta.textContent = `${deals.length} сделок`;
  const btn = document.getElementById("kanban-filters-btn");
  const n = typeof amoFilterActiveCount === "function"
    ? amoFilterActiveCount(kanbanFilters, getKanbanFilterCols())
    : 0;
  if (btn) btn.textContent = n ? `🔍 Фильтры (${n})` : "🔍 Фильтры";
}

async function renderKanban() {
  const el = document.getElementById("page-kanban");
  if (!el) return;
  kanbanStages = await loadKanbanStages();
  const deals = kanbanFilteredDeals();
  const admin = typeof isAdmin === "function" && isAdmin();
  const filterN = typeof amoFilterActiveCount === "function"
    ? amoFilterActiveCount(kanbanFilters, getKanbanFilterCols())
    : 0;

  el.innerHTML = `
    <div class="kanban-toolbar">
      <input type="search" id="kanban-search" class="kanban-search" placeholder="Быстрый поиск…" value="${escapeHtml(kanbanFilters.q || "")}">
      <div class="amo-filter-anchor">
        <button type="button" class="btn btn-sm${kanbanFilterOpen ? " btn-primary" : ""}" id="kanban-filters-btn">🔍 Фильтры${filterN ? ` (${filterN})` : ""}</button>
        <div class="amo-filter-pop" id="kanban-filter-pop" ${kanbanFilterOpen ? "" : "hidden"}></div>
      </div>
      ${admin ? `<button type="button" class="btn btn-sm" id="kanban-config-btn">⚙ Настройки</button>` : ""}
      <span class="muted kanban-hint" id="kanban-meta">${deals.length} сделок</span>
      <button type="button" class="btn btn-sm" onclick="openDealModal()">+ Сделка</button>
    </div>
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
    </div>`;

  document.getElementById("kanban-search")?.addEventListener("input", e => {
    kanbanFilters.q = e.target.value;
    renderKanbanBoardOnly();
  });
  document.getElementById("kanban-filters-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    kanbanFilterOpen = !kanbanFilterOpen;
    const pop = document.getElementById("kanban-filter-pop");
    if (!pop) return;
    if (kanbanFilterOpen) {
      pop.hidden = false;
      mountAmoFilterPanel(pop, {
        filters: kanbanFilters,
        deals: state?.deals || [],
        onApply: f => {
          kanbanFilters = { ...f, q: kanbanFilters.q };
          kanbanFilterOpen = false;
          pop.hidden = true;
          renderKanban();
          showToast("Фильтры применены");
        },
        onReset: () => {
          kanbanFilters = { q: kanbanFilters.q };
        },
      });
      document.getElementById("kanban-filters-btn")?.classList.add("btn-primary");
    } else {
      pop.hidden = true;
      document.getElementById("kanban-filters-btn")?.classList.remove("btn-primary");
    }
  });
  document.addEventListener("click", kanbanCloseFilterOnOutside, { once: true });
  document.getElementById("kanban-config-btn")?.addEventListener("click", () => openKanbanConfigPanel());
  bindKanbanDnD();
}

function kanbanCloseFilterOnOutside(e) {
  if (!e.target.closest(".amo-filter-anchor")) {
    kanbanFilterOpen = false;
    const pop = document.getElementById("kanban-filter-pop");
    if (pop) pop.hidden = true;
    document.getElementById("kanban-filters-btn")?.classList.remove("btn-primary");
  }
}

function openKanbanConfigPanel() {
  let modal = document.getElementById("kanban-config-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "kanban-config-modal";
    modal.className = "modal-overlay kanban-config-modal";
    modal.innerHTML = `<div class="modal" role="dialog" aria-labelledby="kanban-config-title">
      <div class="modal-header">
        <h3 id="kanban-config-title">Настройка столбцов канбана</h3>
        <button type="button" class="btn btn-sm" id="kanban-config-close" aria-label="Закрыть">✕</button>
      </div>
      <div class="modal-body" id="kanban-config-body"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => {
      if (e.target === modal) modal.classList.remove("open");
    });
    modal.querySelector("#kanban-config-close")?.addEventListener("click", () => modal.classList.remove("open"));
  }
  const body = modal.querySelector("#kanban-config-body");
  const all = typeof pipelineStageOptions === "function"
    ? pipelineStageOptions()
    : (state?.lists?.stages || []);
  const visibleStages = kanbanStages || all;
  const hidden = all.filter(s => !visibleStages.includes(s));
  body.innerHTML = `
    <p class="muted" style="font-size:.82rem;margin-bottom:.75rem">Перетащите строки для смены порядка. Снимите галочку, чтобы скрыть столбец.</p>
    <ul class="kanban-config-list" id="kanban-config-list">
      ${visibleStages.map(st => `<li draggable="true" data-stage="${escapeHtml(st)}">
        <span class="drag-handle">☰</span>
        <label><input type="checkbox" class="kanban-col-vis" checked> <span>${escapeHtml(st)}</span></label>
        <button type="button" class="btn btn-sm kanban-col-del" title="Удалить столбец">✕</button>
      </li>`).join("")}
      ${hidden.map(st => `<li draggable="true" data-stage="${escapeHtml(st)}" class="hidden-col">
        <span class="drag-handle">☰</span>
        <label><input type="checkbox" class="kanban-col-vis"> <span>${escapeHtml(st)}</span></label>
        <button type="button" class="btn btn-sm kanban-col-del" title="Удалить столбец">✕</button>
      </li>`).join("")}
    </ul>
    <div style="display:flex;gap:.5rem;margin-top:.75rem;align-items:center">
      <input type="text" id="kanban-new-stage" placeholder="Новый столбец / стадия" style="flex:1">
      <button type="button" class="btn btn-sm" id="kanban-add-stage">+ Добавить</button>
    </div>
    <div style="margin-top:1rem;display:flex;gap:.5rem">
      <button type="button" class="btn btn-primary btn-sm" id="kanban-config-save">Сохранить</button>
      <button type="button" class="btn btn-sm" id="kanban-config-cancel">Отмена</button>
    </div>`;
  modal.classList.add("open");
  bindKanbanConfigDnD();
  body.querySelector("#kanban-add-stage")?.addEventListener("click", () => {
    const inp = body.querySelector("#kanban-new-stage");
    const name = (inp?.value || "").trim();
    if (!name) return;
    const list = body.querySelector("#kanban-config-list");
    const exists = [...list.querySelectorAll("li")].some(li => li.dataset.stage === name);
    if (exists) { alert("Такой столбец уже есть"); return; }
    list.insertAdjacentHTML("beforeend", `<li draggable="true" data-stage="${escapeHtml(name)}">
      <span class="drag-handle">☰</span>
      <label><input type="checkbox" class="kanban-col-vis" checked> <span>${escapeHtml(name)}</span></label>
      <button type="button" class="btn btn-sm kanban-col-del" title="Удалить столбец">✕</button>
    </li>`);
    inp.value = "";
    bindKanbanConfigDnD();
  });
  body.querySelectorAll(".kanban-col-del").forEach(btn => {
    btn.onclick = () => btn.closest("li")?.remove();
  });
  body.querySelector("#kanban-config-save").onclick = async () => {
    const stages = [...body.querySelectorAll("#kanban-config-list li")]
      .filter(li => li.querySelector(".kanban-col-vis")?.checked)
      .map(li => li.dataset.stage);
    if (!stages.length) return alert("Нужен хотя бы один столбец");
    try {
      await apiSaveKanbanConfig(stages);
      kanbanStages = stages;
      modal.classList.remove("open");
      showToast("Столбцы сохранены");
      renderKanban();
    } catch (e) { alert(e.message); }
  };
  body.querySelector("#kanban-config-cancel").onclick = () => modal.classList.remove("open");
}

function bindKanbanConfigDnD() {
  let dragged = null;
  const list = document.getElementById("kanban-config-list");
  if (!list) return;
  list.querySelectorAll("li").forEach(li => {
    li.addEventListener("dragstart", () => { dragged = li; });
    li.addEventListener("dragover", e => { e.preventDefault(); });
    li.addEventListener("drop", e => {
      e.preventDefault();
      if (!dragged || dragged === li) return;
      if (dragged.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING) li.after(dragged);
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
      if (!canEditDeal(deal)) { alert("Нет прав"); return; }
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
