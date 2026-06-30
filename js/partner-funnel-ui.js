/* Канбан и дашборд воронок «Партнёры» / «Технологические партнёры» */

let referenceKanbanStages = null;
let referenceKanbanFilters = { q: "" };
let referenceKanbanMineOnly = localStorage.getItem("itmen_ref_kanban_mine") === "1";

function activeReferenceWorkspace() {
  return typeof getReferenceWorkspaceConfig === "function" ? getReferenceWorkspaceConfig() : null;
}

async function loadReferenceKanbanStages(ws) {
  const canonical = typeof referenceStageOptions === "function" ? referenceStageOptions(ws.id) : [];
  const configKey = ws.kanbanConfigKey;
  try {
    const path = ws.id === "tech_partners" ? "/api/kanban/tech-partners-config" : "/api/kanban/partners-config";
    const { stages } = await crmFetch(path);
    if (Array.isArray(stages) && stages.length) {
      const visible = stages.filter(s => s && s !== "Отказ");
      const merged = [...visible];
      canonical.forEach(s => { if (s && s !== "Отказ" && !merged.includes(s)) merged.push(s); });
      if (merged.length) return merged;
    }
  } catch (_) { /* offline */ }
  return canonical.filter(s => s !== "Отказ");
}

function referenceKanbanFilteredDeals() {
  const ws = activeReferenceWorkspace();
  if (!ws) return [];
  let rows = typeof getWorkspaceDeals === "function" ? getWorkspaceDeals() : [];
  rows = rows.filter(d => !d.archived);
  const q = (referenceKanbanFilters.q || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter(d => `${d.customer || ""} ${d.id || ""} ${d.owner || ""}`.toLowerCase().includes(q));
  }
  if (referenceKanbanMineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) rows = rows.filter(d => mineFn(d));
  }
  return rows;
}

function calcReferenceMetrics(deals, wsId) {
  const stages = typeof referenceStageOptions === "function" ? referenceStageOptions(wsId) : [];
  const stageCounts = Object.fromEntries(stages.map(s => [s, 0]));
  (deals || []).forEach(d => {
    const st = d.stage || "";
    if (stages.includes(st)) stageCounts[st]++;
  });
  const stageFunnel = stages.map(st => ({ stage: st, count: stageCounts[st] || 0 }));
  const maxStage = Math.max(1, ...stageFunnel.map(x => x.count));
  return { pipelineCount: (deals || []).length, stageFunnel, maxStage };
}

function renderReferenceFunnelChart(funnel, maxStage) {
  return (funnel || []).map(({ stage, count }) => {
    const pct = maxStage ? Math.round((count / maxStage) * 100) : 0;
    return `<div class="funnel-row">
      <span class="funnel-label">${escapeHtml(stage)}</span>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${pct}%"></div></div>
      <span class="funnel-count">${count}</span>
    </div>`;
  }).join("") || `<p class="muted">Нет этапов</p>`;
}

function renderReferencePanel() {
  const el = document.getElementById("page-panel");
  const ws = activeReferenceWorkspace();
  if (!el || !ws) return;
  let deals = typeof getWorkspaceDeals === "function" ? getWorkspaceDeals() : [];
  const m = calcReferenceMetrics(deals, ws.id);
  const funnelHtml = renderReferenceFunnelChart(m.stageFunnel, m.maxStage);
  el.innerHTML = `<div data-reference-dash="1">
    <div class="dashboard-filters dashboard-filters-bar">
      <span class="muted">Воронка: <strong>${escapeHtml(ws.label)}</strong></span>
    </div>
    <div class="grid grid-4" style="margin-bottom:1rem">
      <div class="metric-card"><div class="label">В воронке</div><div class="value">${m.pipelineCount}</div></div>
    </div>
    <div class="card"><div class="card-header">Этапы</div><div class="card-body funnel">${funnelHtml}</div></div>
  </div>`;
}

function referenceKanbanCard(d) {
  const canEdit = canEditDeal(d);
  return `<a class="kanban-card" href="#deal/${encodeURIComponent(d.id || "")}" draggable="${canEdit}" data-id="${escapeHtml(d.id)}" data-return="kanban" onclick="return dealPageLinkClick(event)">
    <div class="kanban-card-title">${escapeHtml(d.customer || "—")}</div>
    <div class="kanban-card-meta">
      <span class="badge muted">${escapeHtml(d.stage || "—")}</span>
    </div>
    <div class="kanban-card-foot">
      <span class="kanban-card-owner muted">${typeof ownerAvatarHtml === "function" ? ownerAvatarHtml(d.owner) : ""}<span class="kanban-card-owner-name">${escapeHtml(d.owner || "")}</span></span>
      <span class="kanban-card-amt">${formatMoney(d.amount || 0)}</span>
    </div>
  </a>`;
}

function renderReferenceKanbanBoardOnly() {
  const board = document.getElementById("kanban-board");
  if (!board || !referenceKanbanStages) return;
  const deals = referenceKanbanFilteredDeals();
  board.innerHTML = referenceKanbanStages.map(st => {
    const col = deals.filter(d => d.stage === st);
    const count = col.length;
    const sum = col.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return `<div class="kanban-col" data-stage="${escapeHtml(st)}">
      ${typeof kanbanColHeadHtml === "function" ? kanbanColHeadHtml(st, count, sum, null) : `<div class="kanban-col-head"><div class="kanban-col-title">${escapeHtml(st)}</div></div>`}
      <div class="kanban-col-body" data-stage="${escapeHtml(st)}">
        ${col.map(d => referenceKanbanCard(d)).join("")}
      </div>
    </div>`;
  }).join("");
  bindReferenceKanbanDnD();
  if (typeof bindKanbanMinimap === "function") {
    bindKanbanMinimap({ boardId: "kanban-board", minimapId: "kanban-minimap" });
  }
  const meta = document.getElementById("kanban-meta");
  if (meta) meta.textContent = `${deals.length} записей`;
}

async function renderReferenceKanban() {
  const el = document.getElementById("page-kanban");
  const ws = activeReferenceWorkspace();
  if (!el || !ws) return;
  referenceKanbanStages = await loadReferenceKanbanStages(ws);
  const deals = referenceKanbanFilteredDeals();
  const admin = typeof isAdmin === "function" && isAdmin();
  el.innerHTML = `
    <div class="kanban-page reference-kanban">
      <div class="kanban-toolbar">
        <input type="search" id="ref-kanban-search" class="kanban-search" placeholder="Быстрый поиск…" value="${escapeHtml(referenceKanbanFilters.q || "")}">
        <label class="dash-mine-toggle muted kanban-mine-toggle"><input type="checkbox" id="ref-kanban-mine-only" ${referenceKanbanMineOnly ? "checked" : ""}> Только мои</label>
        ${admin ? `<button type="button" class="btn btn-sm" id="ref-kanban-config-btn">⚙ Настройки</button>` : ""}
        <span class="muted kanban-hint" id="kanban-meta">${deals.length} записей</span>
        <span class="muted">${escapeHtml(ws.label)}</span>
      </div>
      <div class="kanban-wrap">
        <div class="kanban-board" id="kanban-board"></div>
        <div class="kanban-minimap" id="kanban-minimap"></div>
      </div>
    </div>`;
  renderReferenceKanbanBoardOnly();
  document.getElementById("ref-kanban-search")?.addEventListener("input", e => {
    referenceKanbanFilters.q = e.target.value;
    renderReferenceKanbanBoardOnly();
  });
  document.getElementById("ref-kanban-mine-only")?.addEventListener("change", e => {
    referenceKanbanMineOnly = e.target.checked;
    localStorage.setItem("itmen_ref_kanban_mine", referenceKanbanMineOnly ? "1" : "0");
    renderReferenceKanbanBoardOnly();
  });
  document.getElementById("ref-kanban-config-btn")?.addEventListener("click", () => openReferenceKanbanConfigPanel());
}

function bindReferenceKanbanDnD() {
  let dragged = null;
  document.querySelectorAll("#kanban-board .kanban-card").forEach(card => {
    card.addEventListener("dragstart", e => { dragged = card; e.dataTransfer.effectAllowed = "move"; });
    card.addEventListener("dragend", () => { dragged = null; });
  });
  document.querySelectorAll("#kanban-board .kanban-col-body").forEach(col => {
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
        const res = await apiSaveDeal(deal);
        if (res.deal) state.deals[idx] = typeof migrateDeal === "function" ? migrateDeal(res.deal) : res.deal;
        if (typeof persistStateCache === "function") persistStateCache(state);
        renderReferenceKanbanBoardOnly();
        if (typeof showToast === "function") showToast(`Этап → ${newStage}`);
      } catch (err) {
        alert(err.message);
        renderReferenceKanbanBoardOnly();
      }
    });
  });
}

async function openReferenceKanbanConfigPanel() {
  const ws = activeReferenceWorkspace();
  if (!ws) return;
  const all = referenceStageOptions(ws.id);
  let visibleStages = referenceKanbanStages || all;
  let modal = document.getElementById("ref-kanban-config-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "ref-kanban-config-modal";
    modal.className = "modal-overlay kanban-config-modal";
    modal.innerHTML = `<div class="modal"><div class="modal-header"><h3>Настройка столбцов</h3><button type="button" class="btn btn-sm" id="ref-kanban-config-close">✕</button></div><div class="modal-body" id="ref-kanban-config-body"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("#ref-kanban-config-close")?.addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
  }
  const body = modal.querySelector("#ref-kanban-config-body");
  const hidden = all.filter(s => !visibleStages.includes(s));
  body.innerHTML = `
    <ul class="kanban-config-list" id="ref-kanban-config-list">
      ${visibleStages.map(st => `<li draggable="true" data-stage="${escapeHtml(st)}"><span class="drag-handle">☰</span><label><input type="checkbox" class="kanban-col-vis" checked> <span>${escapeHtml(st)}</span></label></li>`).join("")}
      ${hidden.map(st => `<li draggable="true" data-stage="${escapeHtml(st)}" class="hidden-col"><span class="drag-handle">☰</span><label><input type="checkbox" class="kanban-col-vis"> <span>${escapeHtml(st)}</span></label></li>`).join("")}
    </ul>
    <div style="display:flex;gap:.5rem;margin-top:.75rem"><input type="text" id="ref-kanban-new-stage" placeholder="Новый этап" style="flex:1"><button type="button" class="btn btn-sm" id="ref-kanban-add-stage">+ Добавить</button></div>
    <div style="margin-top:1rem"><button type="button" class="btn btn-primary btn-sm" id="ref-kanban-save">Сохранить</button></div>`;
  modal.classList.add("open");
  body.querySelector("#ref-kanban-add-stage")?.addEventListener("click", () => {
    const inp = body.querySelector("#ref-kanban-new-stage");
    const name = (inp?.value || "").trim();
    if (!name) return;
    body.querySelector("#ref-kanban-config-list")?.insertAdjacentHTML("beforeend",
      `<li draggable="true" data-stage="${escapeHtml(name)}"><span class="drag-handle">☰</span><label><input type="checkbox" class="kanban-col-vis" checked> <span>${escapeHtml(name)}</span></label></li>`);
    inp.value = "";
  });
  body.querySelector("#ref-kanban-save").onclick = async () => {
    const listItems = [...body.querySelectorAll("#ref-kanban-config-list li")];
    const allStages = listItems.map(li => li.dataset.stage);
    const stages = listItems.filter(li => li.querySelector(".kanban-col-vis")?.checked).map(li => li.dataset.stage);
    if (!stages.length) return alert("Нужен хотя бы один столбец");
    const path = ws.id === "tech_partners" ? "/api/kanban/tech-partners-config" : "/api/kanban/partners-config";
    try {
      await crmFetch(path, { method: "PUT", body: { stages, allStages } });
      referenceKanbanStages = stages;
      modal.classList.remove("open");
      if (typeof showToast === "function") showToast("Столбцы сохранены");
      renderReferenceKanban();
    } catch (e) { alert(e.message); }
  };
}

window.renderReferencePanel = renderReferencePanel;
window.renderReferenceKanban = renderReferenceKanban;
