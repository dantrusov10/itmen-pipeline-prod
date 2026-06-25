/* Канбан по стадиям */
let kanbanStages = null;
let kanbanFilters = { q: "", owners: [], categories: [] };

async function loadKanbanStages() {
  const all = typeof pipelineStageOptions === "function"
    ? pipelineStageOptions()
    : (state?.lists?.stages || []);
  try {
    const { stages } = await apiKanbanConfig();
    if (Array.isArray(stages) && stages.length) {
      return stages.filter(s => all.includes(s));
    }
  } catch (_) { /* offline / gas */ }
  return all;
}

function kanbanFilteredDeals() {
  const deals = (state?.deals || []).map(enrichDeal).filter(d => !d.archived);
  const q = (kanbanFilters.q || "").trim().toLowerCase();
  const owners = kanbanFilters.owners || [];
  const cats = kanbanFilters.categories || [];
  return deals.filter(d => {
    if (q && !(d.customer || "").toLowerCase().includes(q) && !(d.id || "").toLowerCase().includes(q)) return false;
    if (owners.length && !owners.includes(d.owner)) return false;
    if (cats.length && !cats.includes(d.category)) return false;
    return true;
  });
}

function kanbanColSummary(col) {
  const count = col.length;
  const sum = col.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return { count, sum };
}

async function renderKanban() {
  const el = document.getElementById("page-kanban");
  if (!el) return;
  kanbanStages = await loadKanbanStages();
  const deals = kanbanFilteredDeals();
  const admin = typeof isAdmin === "function" && isAdmin();
  const owners = [...new Set((state?.deals || []).map(d => d.owner).filter(Boolean))].sort();
  const categories = ["Горячая", "Тёплая", "Наблюдение", "Отказ"];

  el.innerHTML = `
    <div class="kanban-toolbar">
      <input type="search" id="kanban-search" class="kanban-search" placeholder="Поиск по клиенту / ID…" value="${escapeHtml(kanbanFilters.q)}">
      <select id="kanban-owner-filter" class="kanban-filter" multiple title="Владелец">
        ${owners.map(o => `<option value="${escapeHtml(o)}"${(kanbanFilters.owners || []).includes(o) ? " selected" : ""}>${escapeHtml(o)}</option>`).join("")}
      </select>
      <select id="kanban-cat-filter" class="kanban-filter" multiple title="Категория">
        ${categories.map(c => `<option value="${c}"${(kanbanFilters.categories || []).includes(c) ? " selected" : ""}>${c}</option>`).join("")}
      </select>
      ${admin ? `<button type="button" class="btn btn-sm" id="kanban-config-btn">⚙ Столбцы</button>` : ""}
      <span class="muted">Перетащите карточку для смены стадии</span>
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
    </div>
    ${admin ? `<div id="kanban-config-panel" class="kanban-config-panel" hidden></div>` : ""}`;

  document.getElementById("kanban-search")?.addEventListener("input", e => {
    kanbanFilters.q = e.target.value;
    renderKanban();
  });
  const bindMulti = (id, key) => {
    document.getElementById(id)?.addEventListener("change", e => {
      kanbanFilters[key] = [...e.target.selectedOptions].map(o => o.value);
      renderKanban();
    });
  };
  bindMulti("kanban-owner-filter", "owners");
  bindMulti("kanban-cat-filter", "categories");
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
        renderKanban();
        showToast(`Стадия → ${newStage}`);
      } catch (err) {
        alert(err.message);
        renderKanban();
      }
    });
  });
}

window.renderKanban = renderKanban;
window.openDealById = openDealById;
