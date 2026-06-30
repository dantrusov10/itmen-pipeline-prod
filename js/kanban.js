/* Канбан по стадиям */
let kanbanStages = null;
let kanbanFilters = {};
let kanbanFilterOpen = false;
let kanbanMineOnly = localStorage.getItem("itmen_kanban_mine") === "1";

function closeKanbanFilterPop() {
  kanbanFilterOpen = false;
  const pop = document.getElementById("kanban-filter-pop");
  if (pop) pop.hidden = true;
  document.getElementById("kanban-filters-btn")?.classList.remove("btn-primary");
  if (typeof unregisterAmoFilterPop === "function") unregisterAmoFilterPop();
}

function openKanbanFilterPop(btn) {
  const pop = document.getElementById("kanban-filter-pop");
  if (!pop) return;
  pop.hidden = false;
  mountAmoFilterPanel(pop, {
    filters: kanbanFilters,
    deals: state?.deals || [],
    onApply: f => {
      kanbanFilters = { ...f, q: kanbanFilters.q };
      closeKanbanFilterPop();
      if (typeof updateKanbanReportHash === "function") updateKanbanReportHash(buildKanbanReportSpec());
      renderKanban();
      showToast("Фильтры применены");
    },
    onReset: () => {
      kanbanFilters = { q: kanbanFilters.q };
      kanbanMineOnly = false;
      localStorage.setItem("itmen_kanban_mine", "0");
    },
    onClose: () => closeKanbanFilterPop(),
  });
  document.getElementById("kanban-filters-btn")?.classList.add("btn-primary");
  if (typeof registerAmoFilterPop === "function") {
    registerAmoFilterPop(pop, btn?.closest(".amo-filter-anchor") || btn, closeKanbanFilterPop);
  }
}

async function loadKanbanStages() {
  const canonical = typeof salesStageOptions === "function"
    ? salesStageOptions()
    : (typeof pipelineStageOptions === "function"
      ? pipelineStageOptions()
      : (state?.lists?.stages || []));
  const allowed = new Set(canonical);
  try {
    const { stages } = await apiKanbanConfig();
    if (Array.isArray(stages) && stages.length) {
      const visible = stages.filter(s => s && s !== "Отказ" && allowed.has(s));
      if (visible.length) return visible;
    }
  } catch (_) { /* offline */ }
  return canonical.filter(s => s !== "Отказ");
}

function kanbanFilteredDeals() {
  let deals = (state?.deals || []).filter(d => !d.archived);
  if (typeof getWorkspaceDeals === "function") {
    deals = getWorkspaceDeals(deals);
  }
  const q = (kanbanFilters.q || "").trim().toLowerCase();
  let rows = deals;
  const stageSel = typeof amoFilterGetMultiselect === "function"
    ? amoFilterGetMultiselect(kanbanFilters, "stage")
    : [];
  if (typeof applyDefaultExcludeRejected === "function") {
    rows = applyDefaultExcludeRejected(rows, stageSel);
  } else {
    rows = rows.filter(d => d.stage !== "Отказ");
  }
  if (typeof dealMatchesAmoFilters === "function") {
    rows = rows.filter(d => dealMatchesAmoFilters(d, kanbanFilters));
  }
  if (q) {
    rows = rows.filter(d => {
      const hay = `${d.customer || ""} ${d.id || ""} ${d.owner || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (kanbanMineOnly) {
    const mineFn = typeof isDealMineForCurrentUser === "function"
      ? isDealMineForCurrentUser
      : (typeof isDealOwnedByCurrentUser === "function" ? isDealOwnedByCurrentUser : null);
    if (mineFn) rows = rows.filter(d => mineFn(d));
  }
  return rows;
}

function kanbanColSummary(col) {
  const scores = col.map(d => enrichDeal(d).score).filter(v => v != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return {
    count: col.length,
    sum: col.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    avgScore,
  };
}

function kanbanColHeadHtml(st, count, sum, avgScore) {
  return `<div class="kanban-col-head">
    <div class="kanban-col-title">${escapeHtml(st)}</div>
    <div class="kanban-col-stats">
      <span class="kanban-col-count badge">${count}</span>
      <span class="kanban-col-sum">${formatMoney(sum)}</span>
      ${avgScore != null ? `<span class="kanban-col-avg">Ø ${avgScore}</span>` : ""}
    </div>
  </div>`;
}

function renderKanbanBoardOnly() {
  const board = document.getElementById("kanban-board");
  if (!board || !kanbanStages) return;
  const deals = kanbanFilteredDeals();
  board.innerHTML = kanbanStages.map(st => {
    const col = deals.filter(d => d.stage === st);
    const { count, sum, avgScore } = kanbanColSummary(col);
    return `<div class="kanban-col" data-stage="${escapeHtml(st)}">
      ${kanbanColHeadHtml(st, count, sum, avgScore)}
      <div class="kanban-col-body" data-stage="${escapeHtml(st)}">
        ${col.map(d => kanbanCard(d)).join("")}
      </div>
    </div>`;
  }).join("");
  bindKanbanDnD();
  bindKanbanMinimap();
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
    <div class="kanban-page">
    <div class="kanban-toolbar">
      <input type="search" id="kanban-search" class="kanban-search" placeholder="Быстрый поиск…" value="${escapeHtml(kanbanFilters.q || "")}">
      <label class="dash-mine-toggle muted kanban-mine-toggle"><input type="checkbox" id="kanban-mine-only" ${kanbanMineOnly ? "checked" : ""}> Только мои</label>
      <div class="amo-filter-anchor">
        <button type="button" class="btn btn-sm${kanbanFilterOpen ? " btn-primary" : ""}" id="kanban-filters-btn">🔍 Фильтры${filterN ? ` (${filterN})` : ""}</button>
        <div class="amo-filter-pop" id="kanban-filter-pop" ${kanbanFilterOpen ? "" : "hidden"}></div>
      </div>
      ${admin ? `<button type="button" class="btn btn-sm" id="kanban-config-btn">⚙ Настройки</button>` : ""}
      <span class="muted kanban-hint" id="kanban-meta">${deals.length} сделок</span>
      <button type="button" class="btn btn-sm" onclick="openNewDealPage('kanban')">+ Сделка</button>
    </div>
    <div class="kanban-wrap">
      <div class="kanban-board" id="kanban-board">
        ${kanbanStages.map(st => {
          const col = deals.filter(d => d.stage === st);
          const { count, sum, avgScore } = kanbanColSummary(col);
          return `<div class="kanban-col" data-stage="${escapeHtml(st)}">
            ${kanbanColHeadHtml(st, count, sum, avgScore)}
            <div class="kanban-col-body" data-stage="${escapeHtml(st)}">
              ${col.map(d => kanbanCard(d)).join("")}
            </div>
          </div>`;
        }).join("")}
      </div>
      <div class="kanban-minimap" id="kanban-minimap" title="Навигация по этапам"></div>
    </div>
    </div>`;

  document.getElementById("kanban-search")?.addEventListener("input", e => {
    kanbanFilters.q = e.target.value;
    renderKanbanBoardOnly();
    if (typeof updateKanbanReportHash === "function") updateKanbanReportHash(buildKanbanReportSpec());
  });
  document.getElementById("kanban-mine-only")?.addEventListener("change", e => {
    kanbanMineOnly = e.target.checked;
    localStorage.setItem("itmen_kanban_mine", kanbanMineOnly ? "1" : "0");
    renderKanbanBoardOnly();
    if (typeof updateKanbanReportHash === "function") updateKanbanReportHash(buildKanbanReportSpec());
  });
  document.getElementById("kanban-filters-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    const btn = e.target;
    if (kanbanFilterOpen) {
      closeKanbanFilterPop();
    } else {
      kanbanFilterOpen = true;
      openKanbanFilterPop(btn);
    }
  });
  document.getElementById("kanban-config-btn")?.addEventListener("click", () => openKanbanConfigPanel());
  bindKanbanDnD();
  bindKanbanMinimap();
}

function bindKanbanMinimap(opts = {}) {
  const boardId = opts.boardId || "kanban-board";
  const minimapId = opts.minimapId || "kanban-minimap";
  const scrollEl = opts.scrollEl || document.querySelector(opts.wrapSelector || ".kanban-page .kanban-wrap");
  const board = document.getElementById(boardId);
  const minimap = document.getElementById(minimapId);
  if (!scrollEl || !board || !minimap) return;
  const stages = opts.stages
    || kanbanStages
    || (typeof presaleKanbanStageColumns === "function" ? presaleKanbanStageColumns() : null)
    || [];
  minimap.innerHTML = `<div class="kanban-minimap-track">
    ${stages.map(() => `<span class="kanban-minimap-seg"></span>`).join("")}
    <div class="kanban-minimap-viewport"></div>
  </div>`;
  const track = minimap.querySelector(".kanban-minimap-track");
  const viewport = minimap.querySelector(".kanban-minimap-viewport");
  if (!track || !viewport) return;

  const update = () => {
    const sw = board.scrollWidth;
    const vw = scrollEl.clientWidth;
    if (sw <= vw) {
      minimap.hidden = true;
      return;
    }
    minimap.hidden = false;
    const tw = track.clientWidth;
    const vpW = Math.max(24, (vw / sw) * tw);
    viewport.style.width = `${vpW}px`;
    viewport.style.left = `${(scrollEl.scrollLeft / (sw - vw)) * (tw - vpW)}px`;
  };

  scrollEl.onscroll = update;
  window.addEventListener("resize", update);
  update();

  minimap.onclick = e => {
    const rect = track.getBoundingClientRect();
    const tw = track.clientWidth;
    const vpW = viewport.offsetWidth;
    const x = Math.max(0, Math.min(e.clientX - rect.left - vpW / 2, tw - vpW));
    const ratio = tw - vpW > 0 ? x / (tw - vpW) : 0;
    scrollEl.scrollLeft = ratio * (board.scrollWidth - scrollEl.clientWidth);
  };

  let drag = false;
  viewport.onmousedown = e => {
    drag = true;
    e.preventDefault();
    e.stopPropagation();
  };
  document.onmousemove = e => {
    if (!drag) return;
    const rect = track.getBoundingClientRect();
    const tw = track.clientWidth;
    const vpW = viewport.offsetWidth;
    const x = Math.max(0, Math.min(e.clientX - rect.left - vpW / 2, tw - vpW));
    const ratio = tw - vpW > 0 ? x / (tw - vpW) : 0;
    scrollEl.scrollLeft = ratio * (board.scrollWidth - scrollEl.clientWidth);
  };
  document.onmouseup = () => { drag = false; };
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
  const all = typeof salesStageOptions === "function"
    ? salesStageOptions()
    : (typeof pipelineStageOptions === "function"
      ? pipelineStageOptions()
      : (state?.lists?.stages || []));
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
    const listItems = [...body.querySelectorAll("#kanban-config-list li")];
    const allStages = listItems.map(li => li.dataset.stage);
    const stages = listItems
      .filter(li => li.querySelector(".kanban-col-vis")?.checked)
      .map(li => li.dataset.stage);
    if (!stages.length) return alert("Нужен хотя бы один столбец");
    try {
      await apiSaveKanbanConfig({ stages, allStages });
      kanbanStages = stages;
      if (state?.lists) {
        const merged = [...allStages];
        if (!merged.includes("Отказ")) merged.push("Отказ");
        state.lists.stages = merged;
      }
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
  const ed = enrichDeal(d);
  return `<a class="kanban-card" href="#deal/${encodeURIComponent(d.id || "")}" draggable="${canEdit}" data-id="${escapeHtml(d.id)}" data-return="kanban" onclick="return dealPageLinkClick(event)">
    <div class="kanban-card-title">${escapeHtml(d.customer || "—")}</div>
    <div class="kanban-card-meta">
      <span class="badge ${categoryBadgeClass(ed.category)}">${escapeHtml(ed.category)}</span>
      ${ed.score != null ? `<span class="kanban-card-score">${ed.score}</span>` : ""}
    </div>
    <div class="kanban-card-foot">
      <span class="kanban-card-owner muted">${typeof ownerAvatarHtml === "function" ? ownerAvatarHtml(d.owner) : ""}<span class="kanban-card-owner-name">${escapeHtml(d.owner || "")}</span></span>
      <span class="kanban-card-amt">${formatMoney(d.amount || 0)}</span>
    </div>
  </a>`;
}

function openDealById(id, ev) {
  if (ev && (ev.ctrlKey || ev.metaKey) && typeof openDealInNewTab === "function") {
    openDealInNewTab(id);
    return;
  }
  if (typeof openDealPage === "function") {
    openDealPage(id, activePage || "kanban");
    return;
  }
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
      if (typeof managerStageChangeBlocked === "function" && managerStageChangeBlocked(newStage, state.deals[idx].stage)) {
        alert("Стадию «Пилот Окончен» может установить только пре-сейл (успех или отказ пилота).");
        return;
      }
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

window.kanbanColHeadHtml = kanbanColHeadHtml;
window.renderKanban = renderKanban;
window.bindKanbanMinimap = bindKanbanMinimap;
window.openDealById = openDealById;
