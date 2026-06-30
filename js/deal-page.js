/* Страница сделки: паспорт слева, лента/требования справа */
let dealPageLeftTab = "passport";
let dealPageRightTab = "events";
let dealPageExplicitTabs = false;
let dealPageReturnPage = "deals";
let dealPageReturnHash = "";
let dealPageLoadToken = 0;
let dealPageDirty = false;
let dealPageSavedSnapshot = "";

const DEAL_LEFT_TABS = [
  { id: "passport", label: "Основное", side: "left" },
  { id: "info", label: "Инфо", side: "left" },
  { id: "presale-main", label: "Основное пре-сейл", side: "left" },
  { id: "presale-events", label: "Пре-сейл", side: "right" },
  { id: "pilot-req", label: "Пилот", side: "right" },
  { id: "product-req", label: "Продукт", side: "right" },
  { id: "kp-calc", label: "КП", side: "right" },
  { id: "files", label: "Файлы", side: "left" },
  { id: "contacts", label: "Контакты", side: "left" },
  { id: "scoring", label: "Скоринг", side: "left" },
];

const DEAL_SUBSECTIONS = DEAL_LEFT_TABS;

const RIGHT_PANEL_TABS = new Set(["pilot-req", "product-req", "presale-events", "kp-calc"]);

function getDealCrmCache() {
  if (!window.dealCrmCache) window.dealCrmCache = {};
  return window.dealCrmCache;
}

function applyDefaultDealPageTabs() {
  if (dealPageExplicitTabs) {
    dealPageExplicitTabs = false;
    return;
  }
  if (RIGHT_PANEL_TABS.has(dealPageRightTab)
    && dealPageRightTab !== "events"
    && dealPageRightTab !== "presale-events") {
    if (dealPageLeftTab !== "passport" && dealPageLeftTab !== "presale-main") {
      dealPageLeftTab = "passport";
    }
    return;
  }
  if (typeof isPresaleOnlyUser === "function" && isPresaleOnlyUser()) {
    dealPageLeftTab = "presale-main";
    dealPageRightTab = "presale-events";
    return;
  }
  dealPageLeftTab = "passport";
  dealPageRightTab = "events";
}

function openDealPage(dealId, returnPage) {
  if (!dealId) return;
  applyDefaultDealPageTabs();
  if (typeof window.dealCrmCache !== "undefined") delete window.dealCrmCache[dealId];
  dealPageReturnPage = returnPage || activePage || "deals";
  dealPageReturnHash = typeof captureListReturnHash === "function"
    ? captureListReturnHash(dealPageReturnPage)
    : ((location.hash || "").replace(/^#/, "") || dealPageReturnPage);
  activeDealId = dealId;
  if (typeof navigate === "function") navigate("deal", null, dealId);
}

function openDealPageWithTab(dealId, tab, returnPage) {
  if (!dealId) return;
  dealPageExplicitTabs = true;
  if (RIGHT_PANEL_TABS.has(tab)) {
    dealPageRightTab = tab;
    if (tab !== "presale-events" && dealPageLeftTab !== "presale-main") {
      dealPageLeftTab = "passport";
    }
  } else {
    dealPageLeftTab = tab;
  }
  openDealPage(dealId, returnPage);
}

function dealPageBack() {
  const dealId = activeDealId;
  const idx = typeof findDealIdxById === "function" ? findDealIdxById(dealId) : -1;
  if (idx >= 0 && state.deals[idx]?._draft && !String(state.deals[idx]?.customer || "").trim()) {
    state.deals.splice(idx, 1);
    editingDealIdx = null;
  }
  clearDealPageTopbar();
  if (typeof restoreNavigationFromHash === "function" && dealPageReturnHash) {
    restoreNavigationFromHash(dealPageReturnHash);
    return;
  }
  if (typeof navigate === "function") navigate(dealPageReturnPage || "deals");
}

function findDealIdxById(dealId) {
  return (state?.deals || []).findIndex(d => d.id === dealId);
}

function renderDealPageTabs() {
  document.querySelectorAll(".deal-page-tab").forEach(btn => {
    const tab = btn.dataset.tab;
    const side = btn.dataset.side;
    btn.classList.remove("active", "active-right");
    if (side === "right") {
      btn.classList.toggle("active-right", tab === dealPageRightTab);
    } else if (RIGHT_PANEL_TABS.has(dealPageRightTab)) {
      btn.classList.toggle("active", tab === "passport" && dealPageLeftTab === "passport");
    } else {
      btn.classList.toggle("active", tab === dealPageLeftTab);
    }
  });
}

function bindDealPageDelete(dealId) {
  const btn = document.getElementById("deal-page-delete");
  if (!btn || btn.dataset.bound === dealId) return;
  btn.dataset.bound = dealId;
  btn.addEventListener("click", () => {
    const idx = typeof findDealIdxById === "function" ? findDealIdxById(dealId) : -1;
    if (idx < 0) {
      alert("Сделка не найдена в списке");
      return;
    }
    if (typeof deleteDealAsync === "function") {
      deleteDealAsync(idx).then(() => {
        if (typeof dealPageBack === "function") dealPageBack();
      }).catch(e => alert(e.message || String(e)));
    } else if (typeof deleteDeal === "function") {
      deleteDeal(idx);
    }
  });
}

function dealTabEditable(tabId, deal) {
  if (typeof canEditDealTab === "function") return canEditDealTab(tabId, deal);
  return typeof canEditDeal === "function" ? canEditDeal(deal) : false;
}

function renderDealPageHeader(d) {
  const stage = d.stage || "—";
  const owner = d.owner || "—";
  const amount = typeof formatMoney === "function" ? formatMoney(d.amount || 0) : (d.amount || 0);
  const salesEditable = typeof canEditSalesDeal === "function" ? canEditSalesDeal(d) : canEditDeal(d);
  const stages = (typeof isAdmin === "function" && isAdmin())
    ? (typeof pipelineStageOptions === "function" ? pipelineStageOptions() : [stage])
    : (typeof managerSelectableStageOptions === "function" ? managerSelectableStageOptions(stage) : [stage]);
  const stageHtml = salesEditable
    ? `<select class="deal-page-stage-pill deal-page-stage-select" id="deal-page-header-stage" title="Стадия продаж">
        ${stages.map(s => `<option value="${escapeHtml(s)}"${s === stage ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
      </select>`
    : `<span class="deal-page-stage-pill">${escapeHtml(stage)}</span>`;
  const managerStageSlot = `<div class="deal-page-stage-slot">
    <span class="deal-page-stage-label">Менеджер</span>
    ${stageHtml}
  </div>`;
  const presaleStageHtml = typeof renderPresaleStagePill === "function" ? renderPresaleStagePill(d) : "";
  return `
    <div class="deal-page-hero">
      <div class="deal-page-hero-top">
        <h1 class="deal-page-title" title="${escapeHtml(d.customer || "Без названия")}">${escapeHtml(d.customer || "Без названия")}</h1>
        <div class="deal-page-hero-menu-wrap">
          <button type="button" class="deal-page-menu-btn" id="deal-page-menu-btn" title="Подразделы" aria-label="Подразделы">☰</button>
          <div class="deal-page-submenu-pop" id="deal-page-submenu-pop" hidden></div>
        </div>
      </div>
      <div class="deal-page-meta">
        <span class="deal-page-id">${escapeHtml(d.id || "")}</span>
        ${d.amoId ? `<span class="deal-page-amo">amo ${escapeHtml(String(d.amoId))}</span>` : ""}
      </div>
      <div class="deal-page-stage-row">
        ${managerStageSlot}
        ${presaleStageHtml}
        <span class="deal-page-hero-meta">${escapeHtml(owner)} · ${escapeHtml(amount)}</span>
        ${typeof renderKpHeaderBadge === "function" ? renderKpHeaderBadge(d.id) : ""}
        ${typeof isAdmin === "function" && isAdmin() ? `<button type="button" class="btn btn-sm btn-danger" id="deal-page-delete">Удалить</button>` : ""}
      </div>
    </div>`;
}

function bindDealPageHeaderStage() {
  const sel = document.getElementById("deal-page-header-stage");
  if (sel) {
    if (!sel.dataset.bound) {
      sel.dataset.bound = "1";
      sel.addEventListener("change", () => {
        const fStage = document.getElementById("f-stage");
        if (fStage) fStage.value = sel.value;
        if (typeof toggleLossReasonField === "function") toggleLossReasonField();
        if (typeof markDealPageDirty === "function") markDealPageDirty();
      });
    }
    const fStage = document.getElementById("f-stage");
    if (fStage) {
      if (fStage.value !== sel.value) sel.value = fStage.value;
      if (!fStage.dataset.headerSync) {
        fStage.dataset.headerSync = "1";
        fStage.addEventListener("change", () => {
          if (sel.value !== fStage.value) sel.value = fStage.value;
        });
      }
    }
  }
  const pSel = document.getElementById("deal-page-presale-stage");
  if (pSel && !pSel.dataset.bound) {
    pSel.dataset.bound = "1";
    pSel.addEventListener("change", async () => {
      const fPresaleStage = document.getElementById("f-presale-stage");
      if (fPresaleStage) fPresaleStage.value = pSel.value;
      if (typeof togglePresaleLossFields === "function") togglePresaleLossFields();
      if (typeof canEditPresaleDeal === "function" && canEditPresaleDeal(state.deals[editingDealIdx]) && activeDealId) {
        try {
          await savePresaleFromDealPage(activeDealId);
          if (typeof showToast === "function") showToast("Этап пре-сейла сохранён");
        } catch (e) {
          alert(e.message || String(e));
          const d = state.deals[editingDealIdx];
          const eff = typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : (d?.presale?.stage || "");
          pSel.value = d?.presale?.stage || eff || "";
          if (fPresaleStage) fPresaleStage.value = pSel.value;
        }
      } else if (typeof markDealPageDirty === "function") {
        markDealPageDirty();
      }
    });
  }
}

function renderLeftPassportBody(idx) {
  const d = migrateDeal(state.deals[idx]);
  const editable = dealTabEditable("passport", d);
  const html = typeof buildDealPassportHtml === "function"
    ? buildDealPassportHtml(d, editable, modalSuggestion, { includeScoring: false })
    : `<p class="muted">Паспорт недоступен</p>`;
  return { html, editable };
}

async function switchDealPageLeftTab(tab) {
  if (!tab || RIGHT_PANEL_TABS.has(tab)) return;
  dealPageLeftTab = tab;
  renderDealPageTabs();
  const body = document.getElementById("deal-page-left-body");
  if (!body) return;
  const dealId = activeDealId;
  const idx = findDealIdxById(dealId);
  if (idx < 0) {
    body.innerHTML = `<p class="muted">Сделка не найдена</p>`;
    return;
  }
  editingDealIdx = idx;

  if (tab === "passport") {
    const { html, editable } = renderLeftPassportBody(idx);
    body.innerHTML = html;
    if (typeof toggleBudgetPlannedDate === "function") toggleBudgetPlannedDate();
    if (typeof toggleLossReasonField === "function") toggleLossReasonField();
    if (typeof applyDealModalReadOnly === "function") applyDealModalReadOnly(editable);
    if (typeof bindDealPassportExtras === "function") bindDealPassportExtras(body);
    else {
      if (typeof bindPassportMoneyInputs === "function") bindPassportMoneyInputs(body);
      if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(body);
    }
    bindDealPageDirtyTracking();
    resetDealPageDirty();
    bindDealPageHeaderStage();
    return;
  }

  if (tab === "scoring") {
    const d = migrateDeal(state.deals[idx]);
    const editable = dealTabEditable("scoring", d);
    body.innerHTML = typeof buildDealScoringHtml === "function"
      ? buildDealScoringHtml(d, modalSuggestion)
      : `<p class="muted">Скоринг недоступен</p>`;
    if (typeof applyDealModalReadOnly === "function") applyDealModalReadOnly(editable);
    if (typeof bindScoreSectionUi === "function") bindScoreSectionUi(body);
    if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(body);
    bindDealPageDirtyTracking();
    resetDealPageDirty();
    return;
  }

  if (tab === "presale-main") {
    const d = migrateDeal(state.deals[idx]);
    body.innerHTML = typeof renderPresaleMainTab === "function"
      ? renderPresaleMainTab(d)
      : `<p class="muted">Пре-сейл недоступен</p>`;
    if (typeof bindPresaleMainForm === "function") bindPresaleMainForm(dealId);
    bindDealPageDirtyTracking();
    resetDealPageDirty();
    bindDealPageHeaderStage();
    return;
  }

  body.innerHTML = `<p class="muted">Загрузка…</p>`;
  try {
    const cache = getDealCrmCache();
    if (!cache[dealId]) cache[dealId] = await apiLoadDealCrm(dealId);
    const crm = cache[dealId];
    if (tab === "files") body.innerHTML = renderFilesTab(dealId, crm);
    else if (tab === "contacts") body.innerHTML = renderContactsTab(dealId, crm);
    else if (tab === "info") body.innerHTML = renderInfoTab(dealId, crm);
    bindDealCrmTabEvents(dealId, tab, async () => {
      delete getDealCrmCache()[dealId];
      if (tab === "files" || tab === "contacts" || tab === "info") {
        await switchDealPageLeftTab(dealPageLeftTab);
      } else {
        await refreshDealPageRightPanel();
      }
      if (typeof loadDealNextTaskDue === "function") await loadDealNextTaskDue();
    });
  } catch (e) {
    body.innerHTML = `<p class="muted" style="color:#b45309">${escapeHtml(e.message || String(e))}</p>`;
  }
}

async function switchDealPageRightTab(tab) {
  if (!tab) return;
  if (RIGHT_PANEL_TABS.has(tab)) {
    dealPageRightTab = tab;
    if (dealPageLeftTab !== "passport") {
      dealPageLeftTab = "passport";
      await switchDealPageLeftTab("passport");
    } else {
      const body = document.getElementById("deal-page-left-body");
      const idx = findDealIdxById(activeDealId);
      if (body && idx >= 0 && !body.querySelector("#f-customer")) {
        await switchDealPageLeftTab("passport");
      }
    }
  } else {
    dealPageRightTab = tab;
  }
  renderDealPageTabs();
  updateDealPageComposeVisibility();
  bindDealPageCompose(activeDealId);
  bindDealPageSubmenu(tab);
  await loadDealPageRightPanel();
}

function updateDealPageComposeVisibility() {
  const compose = document.getElementById("deal-page-compose");
  if (!compose) return;
  compose.hidden = !(dealPageRightTab === "events" || dealPageRightTab === "presale-events");
}

function getDealComposeOptions() {
  return dealPageRightTab === "presale-events" ? { mode: "presale" } : {};
}

function bindDealPageCompose(dealId) {
  const compose = document.getElementById("deal-page-compose");
  if (!compose || typeof renderDealActivityCompose !== "function") return;
  const tab = dealPageRightTab;
  const canEdit = tab === "presale-events"
    ? dealTabEditable("presale-events", state.deals[editingDealIdx])
    : dealTabCanEdit();
  compose.innerHTML = renderDealActivityCompose(canEdit);
  if (typeof bindDealActivityComposeEvents === "function") {
    bindDealActivityComposeEvents(dealId, refreshDealPageRightPanel, getDealComposeOptions());
  }
}

function captureDealLeftSnapshot() {
  const body = document.getElementById("deal-page-left-body");
  if (!body) return "";
  return [...body.querySelectorAll("input, select, textarea")].map(el => {
    const key = el.id || el.name || el.className;
    const v = el.type === "checkbox" ? (el.checked ? "1" : "0") : (el.value ?? "");
    return `${key}:${v}`;
  }).join("|");
}

function resetDealPageDirty() {
  dealPageSavedSnapshot = captureDealLeftSnapshot();
  dealPageDirty = false;
  updateDealPageSaveBar();
}

function markDealPageDirty() {
  dealPageDirty = captureDealLeftSnapshot() !== dealPageSavedSnapshot;
  updateDealPageSaveBar();
}

function updateDealPageSaveBar() {
  const bar = document.getElementById("deal-page-save-bar");
  if (!bar) return;
  bar.hidden = !dealPageDirty;
}

function bindDealPageDirtyTracking() {
  const body = document.getElementById("deal-page-left-body");
  if (!body || body.dataset.dirtyBound) return;
  body.dataset.dirtyBound = "1";
  body.addEventListener("input", markDealPageDirty);
  body.addEventListener("change", markDealPageDirty);
}

function renderDealPageTopbar() {
  const slot = document.getElementById("topbar-page-actions");
  if (slot) slot.replaceChildren();
}

function renderDealPageTitleBar(dealId) {
  const title = document.getElementById("page-title");
  if (!title) return;
  title.innerHTML = `<button type="button" class="deal-page-back-icon" id="deal-page-back" title="Назад" aria-label="Назад">←</button>
    <span class="deal-page-title-text">Сделка · ${escapeHtml(dealId || "")}</span>`;
  document.getElementById("deal-page-back")?.addEventListener("click", dealPageBack);
}

function clearDealPageTopbar() {
  document.getElementById("topbar-page-actions")?.replaceChildren();
}

async function loadDealPageRightPanel() {
  const panel = document.getElementById("deal-page-right-scroll");
  if (!panel) return;
  const dealId = activeDealId;
  const idx = findDealIdxById(dealId);
  if (idx < 0) return;
  editingDealIdx = idx;

  panel.innerHTML = `<p class="muted">Загрузка…</p>`;
  panel.classList.toggle("kp-calc-active", dealPageRightTab === "kp-calc");
  try {
    if (dealPageRightTab === "events") {
      const cache = getDealCrmCache();
      delete cache[dealId];
      cache[dealId] = await apiLoadDealCrm(dealId);
      const crm = cache[dealId];
      panel.innerHTML = typeof renderDealActivityTimeline === "function"
        ? renderDealActivityTimeline(crm, "manager")
        : `<p class="muted">Лента недоступна</p>`;
      const tasksPin = document.getElementById("deal-page-tasks-pin");
      if (tasksPin) {
        const pinHtml = typeof renderDealOpenTasksPin === "function" ? renderDealOpenTasksPin(crm, "manager") : "";
        if (pinHtml) {
          tasksPin.hidden = false;
          tasksPin.innerHTML = pinHtml;
        } else {
          tasksPin.hidden = true;
          tasksPin.innerHTML = "";
        }
      }
      bindDealActivityEvents(dealId, refreshDealPageRightPanel);
      scrollDealFeedToBottom();
      return;
    }
    const tasksPin = document.getElementById("deal-page-tasks-pin");
    if (tasksPin) {
      tasksPin.hidden = true;
      tasksPin.innerHTML = "";
    }
    if (dealPageRightTab === "pilot-req") {
      const data = await apiLoadPilotRequirements(dealId);
      const editable = dealTabEditable("pilot-req", state.deals[idx]);
      panel.innerHTML = `<div class="deal-page-right-panel">${renderPilotRequirementsTab(dealId, data, editable)}</div>`;
      bindPilotRequirementsEvents(dealId, editable);
      if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(panel);
      if (typeof applyRequirementsHighlight === "function") applyRequirementsHighlight(dealId, "pilot");
      return;
    }
    if (dealPageRightTab === "product-req") {
      const data = await apiLoadProductRequirements(dealId);
      const editable = dealTabEditable("product-req", state.deals[idx]);
      panel.innerHTML = `<div class="deal-page-right-panel">${renderProductRequirementsTab(dealId, data, editable)}</div>`;
      bindProductRequirementsEvents(dealId, editable);
      if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(panel);
      if (typeof applyRequirementsHighlight === "function") applyRequirementsHighlight(dealId, "product");
      return;
    }
    if (dealPageRightTab === "kp-calc") {
      if (!getDealCrmCache()[dealId]) getDealCrmCache()[dealId] = await apiLoadDealCrm(dealId);
      panel.innerHTML = typeof renderKpCalculatorPanel === "function"
        ? renderKpCalculatorPanel(dealId)
        : `<p class="muted">Калькулятор КП недоступен</p>`;
      if (typeof bindKpCalculatorBridge === "function") bindKpCalculatorBridge(dealId);
      return;
    }
    if (dealPageRightTab === "presale-events") {
      if (typeof loadPresaleEventsPanel === "function") {
        await loadPresaleEventsPanel(dealId, panel);
      } else {
        panel.innerHTML = `<p class="muted">Лента пре-сейла недоступна</p>`;
      }
      return;
    }
  } catch (e) {
    panel.innerHTML = `<p class="muted" style="color:#b45309">${escapeHtml(e.message || String(e))}</p>`;
  }
}

function scrollDealFeedToBottom() {
  requestAnimationFrame(() => {
    const el = document.getElementById("deal-page-right-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function refreshDealPageRightPanel() {
  if (dealPageRightTab !== "events" && dealPageRightTab !== "presale-events") return;
  const dealId = activeDealId;
  if (!dealId) return;
  delete getDealCrmCache()[dealId];
  await loadDealPageRightPanel();
  bindDealPageCompose(dealId);
}

function handleDealPageTabClick(tab, side) {
  if (side === "right" || RIGHT_PANEL_TABS.has(tab)) {
    switchDealPageRightTab(tab);
    bindDealPageSubmenu(tab);
    return;
  }
  dealPageRightTab = "events";
  switchDealPageLeftTab(tab).then(() => {
    renderDealPageTabs();
    updateDealPageComposeVisibility();
    bindDealPageSubmenu(tab);
    loadDealPageRightPanel();
  });
}

async function loadDealPageContent(dealId) {
  const token = ++dealPageLoadToken;
  const el = document.getElementById("page-deal");
  if (!el) return;

  let idx = findDealIdxById(dealId);
  if (idx < 0) {
    el.innerHTML = `<div class="card" style="margin:1rem"><div class="card-body">
      <p>Сделка <strong>${escapeHtml(dealId)}</strong> не найдена.</p>
      <button type="button" class="btn btn-sm" onclick="dealPageBack()">← Назад</button>
    </div></div>`;
    return;
  }

  editingDealIdx = idx;
  let d = migrateDeal(state.deals[idx]);
  if (d?.id && needsFullDeal(d) && window.ITMEN_API?.enabled) {
    try {
      await ensureArchitectureLoaded();
      const full = await apiLoadDeal(d.id);
      if (token !== dealPageLoadToken) return;
      if (full) {
        state.deals[idx] = migrateDeal(full);
        d = state.deals[idx];
        persistStateCache(state);
      }
    } catch (e) {
      console.warn("loadDealPage:", e);
    }
  }
  if (token !== dealPageLoadToken) return;

  modalSuggestion = suggestScores(d);
  const hasScores = Object.values(d.scores || {}).some(v => v > 0);
  if (!hasScores && modalSuggestion) {
    d.scores = { ...modalSuggestion.scores };
    d.scoreReasons = { ...modalSuggestion.reasons };
    d.scores.loyalty = d.scores.loyalty ?? 0;
    d.scoreReasons.loyalty = "Оценивается только вручную";
  }

  const editable = typeof canEditDeal === "function" ? canEditDeal(d) : false;
  const activeSub = RIGHT_PANEL_TABS.has(dealPageRightTab) ? dealPageRightTab : dealPageLeftTab;

  el.innerHTML = `
    <div class="deal-page">
      <div class="deal-page-split" id="deal-page-split">
        <aside class="deal-page-left">
          <div class="deal-page-left-sticky">
            <div class="deal-page-left-top" id="deal-page-header">${renderDealPageHeader(d)}</div>
          </div>
          <div class="deal-page-left-scroll" id="deal-page-left-body"></div>
          <div class="deal-page-save-bar" id="deal-page-save-bar" hidden>
            <button type="button" class="btn btn-primary btn-sm" id="deal-page-save">Сохранить</button>
            <button type="button" class="btn btn-sm" id="deal-page-cancel">Отмена</button>
          </div>
        </aside>
        <div class="deal-page-resizer" id="deal-page-resizer" title="Перетащите для изменения ширины"></div>
        <section class="deal-page-right">
          <div class="deal-page-right-scroll" id="deal-page-right-scroll"><p class="muted">Загрузка…</p></div>
          <div class="deal-page-tasks-pin" id="deal-page-tasks-pin" hidden></div>
          <div class="deal-page-compose-wrap" id="deal-page-compose"></div>
        </section>
      </div>
    </div>`;

  renderDealPageTopbar();
  renderDealPageTitleBar(dealId);
  bindDealPageHeaderStage();
  bindDealPageDelete(dealId);

  document.getElementById("deal-page-save")?.addEventListener("click", saveDealPage);
  document.getElementById("deal-page-cancel")?.addEventListener("click", () => {
    switchDealPageLeftTab(dealPageLeftTab);
  });

  el.querySelector("#deal-page-subsection-select")?.addEventListener("change", e => {
    const tab = e.target.value;
    const meta = DEAL_SUBSECTIONS.find(t => t.id === tab);
    if (!meta) return;
    handleDealPageTabClick(tab, meta.side);
    e.target.value = tab;
  });

  bindDealPageSubmenu(activeSub);

  await switchDealPageLeftTab(dealPageLeftTab);
  updateDealPageComposeVisibility();
  bindDealPageHeaderStage();
  bindDealPageCompose(dealId);
  await loadDealPageRightPanel();
  bindDealPageResizer();
  if (d.id && window.ITMEN_API?.enabled) {
    apiLoadDealCrm(d.id).then(crm => {
      if (token !== dealPageLoadToken) return;
      getDealCrmCache()[d.id] = crm;
      if (typeof updateDealPageKpHeader === "function") updateDealPageKpHeader(d.id);
    }).catch(() => {});
  }
  const leftBody = document.getElementById("deal-page-left-body");
  const rightScroll = document.getElementById("deal-page-right-scroll");
  if (typeof observeAutoGrowRoot === "function") {
    if (leftBody) observeAutoGrowRoot(leftBody);
    if (rightScroll) observeAutoGrowRoot(rightScroll);
  }
}

function bindDealPageSubmenu(activeTab) {
  const btn = document.getElementById("deal-page-menu-btn");
  const pop = document.getElementById("deal-page-submenu-pop");
  if (!btn || !pop) return;
  const cur = activeTab || (typeof getDealPageRightTab === "function" && RIGHT_PANEL_TABS.has(dealPageRightTab)
    ? dealPageRightTab
    : dealPageLeftTab);
  pop.innerHTML = DEAL_SUBSECTIONS.map(t =>
    `<button type="button" class="deal-page-submenu-item${t.id === cur ? " active" : ""}" data-tab="${escapeHtml(t.id)}" data-side="${escapeHtml(t.side)}">${escapeHtml(t.label)}</button>`
  ).join("");
  const close = () => { pop.hidden = true; };
  btn.onclick = e => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
  };
  pop.querySelectorAll(".deal-page-submenu-item").forEach(item => {
    item.onclick = () => {
      handleDealPageTabClick(item.dataset.tab, item.dataset.side);
      bindDealPageSubmenu(item.dataset.tab);
      close();
    };
  });
  if (!window._dealSubmenuOutsideBound) {
    document.addEventListener("click", e => {
      if (!e.target.closest(".deal-page-hero-menu-wrap")) close();
    });
    window._dealSubmenuOutsideBound = true;
  }
}

const DEAL_LEFT_WIDTH_KEY = "dealPageLeftWidth";
const DEAL_LEFT_MIN_PX = 360;

function bindDealPageResizer() {
  const split = document.getElementById("deal-page-split");
  const resizer = document.getElementById("deal-page-resizer");
  if (!split || !resizer || resizer.dataset.bound) return;
  resizer.dataset.bound = "1";
  const saved = parseInt(localStorage.getItem(DEAL_LEFT_WIDTH_KEY) || "", 10);
  if (saved >= DEAL_LEFT_MIN_PX) split.style.setProperty("--deal-left-width", `${saved}px`);

  let dragging = false;
  const onMove = e => {
    if (!dragging) return;
    const rect = split.getBoundingClientRect();
    const maxW = rect.width * 0.5;
    const w = Math.min(maxW, Math.max(DEAL_LEFT_MIN_PX, e.clientX - rect.left));
    split.style.setProperty("--deal-left-width", `${w}px`);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const w = parseInt(getComputedStyle(split).getPropertyValue("--deal-left-width"), 10) || DEAL_LEFT_MIN_PX;
    localStorage.setItem(DEAL_LEFT_WIDTH_KEY, String(Math.round(w)));
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  resizer.addEventListener("mousedown", e => {
    dragging = true;
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function renderDealPage(dealId) {
  activeDealId = dealId || "";
  dealPageDirty = false;
  renderDealPageTitleBar(dealId);
  loadDealPageContent(dealId).catch(e => {
    console.error("renderDealPage:", e);
    const el = document.getElementById("page-deal");
    if (el) el.innerHTML = `<div class="card" style="margin:1rem"><div class="card-body">${escapeHtml(e.message || String(e))}</div></div>`;
  });
}

function updateDealPageHeaderAfterSave(deal) {
  const hdr = document.getElementById("deal-page-header");
  if (hdr) {
    hdr.innerHTML = renderDealPageHeader(deal);
    bindDealPageHeaderStage();
    bindDealPageDelete(deal.id);
    const sub = RIGHT_PANEL_TABS.has(dealPageRightTab) ? dealPageRightTab : dealPageLeftTab;
    bindDealPageSubmenu(sub);
  }
  renderDealPageTitleBar(deal.id);
  resetDealPageDirty();
}

function saveDealPage() {
  const dealId = activeDealId;
  const tab = RIGHT_PANEL_TABS.has(dealPageRightTab) ? dealPageRightTab : dealPageLeftTab;
  if (tab === "presale-main" && typeof savePresaleFromDealPage === "function") {
    savePresaleFromDealPage(dealId).then(() => {
      resetDealPageDirty();
      if (typeof showToast === "function") showToast("Пре-сейл сохранён");
    }).catch(e => alert(e.message || String(e)));
    return;
  }
  if (typeof saveDealFromDomAsync === "function") {
    saveDealFromDomAsync({ closeModal: false, stayOnPage: true }).catch(e => alert(e.message || String(e)));
  }
}

window.openDealPage = openDealPage;
window.openDealPageWithTab = openDealPageWithTab;
function updateDealPageKpHeader(dealId) {
  const hdr = document.getElementById("deal-page-header");
  const idx = findDealIdxById(dealId);
  if (hdr && idx >= 0) {
    const deal = migrateDeal(state.deals[idx]);
    hdr.innerHTML = renderDealPageHeader(deal);
    bindDealPageHeaderStage();
    bindDealPageDelete(deal.id);
    const sub = RIGHT_PANEL_TABS.has(dealPageRightTab) ? dealPageRightTab : dealPageLeftTab;
    bindDealPageSubmenu(sub);
  }
}

window.updateDealPageKpHeader = updateDealPageKpHeader;
window.renderDealPage = renderDealPage;
window.dealPageBack = dealPageBack;
window.saveDealPage = saveDealPage;
window.updateDealPageHeaderAfterSave = updateDealPageHeaderAfterSave;
window.refreshDealPageActivity = refreshDealPageRightPanel;
window.clearDealPageTopbar = clearDealPageTopbar;
window.renderDealPageTopbar = renderDealPageTopbar;
window.resetDealPageDirty = resetDealPageDirty;
window.getDealPageLeftTab = () => dealPageLeftTab;
window.getDealPageRightTab = () => dealPageRightTab;
window.DEAL_SUBSECTIONS = DEAL_SUBSECTIONS;
window.RIGHT_PANEL_TABS = RIGHT_PANEL_TABS;
