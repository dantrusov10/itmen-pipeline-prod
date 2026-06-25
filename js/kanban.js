/* Канбан по стадиям */
function renderKanban() {
  const el = document.getElementById("page-kanban");
  if (!el) return;
  const stages = typeof pipelineStageOptions === "function"
    ? pipelineStageOptions()
    : (state?.lists?.stages || []);
  const deals = (state?.deals || []).map(enrichDeal);
  el.innerHTML = `
    <div class="kanban-toolbar">
      <span class="muted">Перетащите карточку для смены стадии</span>
      <button type="button" class="btn btn-sm" onclick="openDealModal()">+ Сделка</button>
    </div>
    <div class="kanban-board" id="kanban-board">
      ${stages.map(st => {
        const col = deals.filter(d => d.stage === st);
        return `<div class="kanban-col" data-stage="${escapeHtml(st)}">
          <div class="kanban-col-head">${escapeHtml(st)} <span class="badge">${col.length}</span></div>
          <div class="kanban-col-body" data-stage="${escapeHtml(st)}">
            ${col.map(d => kanbanCard(d)).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>`;
  bindKanbanDnD();
}

function kanbanCard(d) {
  const canEdit = canEditDeal(d);
  return `<div class="kanban-card" draggable="${canEdit}" data-id="${escapeHtml(d.id)}" onclick="openDealById('${escapeHtml(d.id)}')">
    <div class="kanban-card-title">${escapeHtml(d.customer || "—")}</div>
    <div class="kanban-card-meta"><span class="badge ${categoryBadgeClass(d.category)}">${escapeHtml(d.category)}</span>
      <span class="muted">${escapeHtml(d.owner || "")}</span></div>
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
