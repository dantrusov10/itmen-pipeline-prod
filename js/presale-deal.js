/* Пре-сейл внутри сделки: основные поля, лента, этап в шапке */
function presaleLossReasonOptions() {
  return window.ITMEN_PRESALE_LOSS_REASONS || [
    "Провал пилота (функциональный)",
    "Провал до пилота (не функциональный)",
    "Провал после демо (функциональный)",
  ];
}

function presaleDisplayStage(d) {
  const presale = typeof normalizePresaleBlock === "function"
    ? normalizePresaleBlock(d?.presale, d)
    : (d?.presale || {});
  return presale.stage || (typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : "") || "—";
}

function renderPresaleStagePill(d) {
  const presale = typeof normalizePresaleBlock === "function"
    ? normalizePresaleBlock(d?.presale, d)
    : (d?.presale || {});
  const storedStage = String(d?.presale_stage || presale.stage || "").trim();
  const displayStage = storedStage
    || (typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : "")
    || "";
  const stages = typeof presaleStageOptions === "function" ? presaleStageOptions() : [];
  const editable = typeof canEditPresaleDeal === "function" ? canEditPresaleDeal(d) : false;
  const show = typeof dealInPresaleFunnel === "function" ? dealInPresaleFunnel(d) : Boolean(displayStage);
  if (!show) return "";
  const cur = storedStage || displayStage;
  const inner = editable
    ? `<select class="deal-page-stage-pill deal-page-stage-select" id="deal-page-presale-stage" title="Этап пре-сейла">
        <option value="">—</option>
        ${stages.map(s => `<option value="${escapeHtml(s)}"${s === cur ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
      </select>`
    : `<span class="deal-page-stage-pill">${escapeHtml(displayStage || "—")}</span>`;
  return `<div class="deal-page-stage-slot">
    <span class="deal-page-stage-label">Пре-сейл</span>
    ${inner}
  </div>`;
}

function renderPresaleMainTab(d) {
  const presale = typeof normalizePresaleBlock === "function"
    ? normalizePresaleBlock(d?.presale, d)
    : (d?.presale || {});
  const editable = typeof canEditPresaleDeal === "function" ? canEditPresaleDeal(d) : false;
  const ro = editable ? "" : " disabled";
  const owners = state?.lists?.presale_owners
    || (typeof getPresaleStaffNames === "function" ? getPresaleStaffNames() : [])
    || state?.lists?.owners
    || [];
  const ownerVal = typeof presaleOwnerForDeal === "function" ? presaleOwnerForDeal(d) : (presale.owner || "");
  const ownerOpts = owners.map(o => `<option value="${escapeHtml(o)}"${o === ownerVal ? " selected" : ""}>${escapeHtml(o)}</option>`).join("");
  const effectiveStage = String(d?.presale_stage || presale.stage || "").trim()
    || (typeof resolvePresaleStage === "function" ? resolvePresaleStage(d) : "")
    || "";
  const lossVisible = effectiveStage === (window.ITMEN_PRESALE_STAGE_OTKAZ || "Отказ") ? "" : " hidden";
  const successNoPilot = Boolean(presale.successWithoutPilot);
  return `
    <div class="presale-main-form">
      <h3 class="presale-section-title">Основное пре-сейл</h3>
      <div class="form-grid form-grid-2">
        <div><label>Ответственный пре-сейл</label>
          <select id="f-presale-owner"${ro}>${ownerOpts}</select></div>
        <div><label>Этап пре-сейла</label>
          <select id="f-presale-stage"${ro}>
            <option value="">—</option>
            ${(typeof presaleStageOptions === "function" ? presaleStageOptions() : []).map(s =>
              `<option value="${escapeHtml(s)}"${s === effectiveStage ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
          </select></div>
        <div class="span-2 presale-success-no-pilot-row">
          <label class="presale-checkbox-label">
            <input type="checkbox" id="f-presale-successWithoutPilot"${successNoPilot ? " checked" : ""}${ro}>
            Успех без пилота
          </label>
          <p class="muted small">При сохранении: пре-сейл → «Успех пилота», менеджер → «Финальный компред», системная отметка в ленте.</p>
        </div>
        <div><label>Дата начала пилота</label>
          <input type="date" id="f-presale-pilotStart" value="${escapeHtml(presale.pilotStart || "")}"${ro}></div>
        <div><label>Дата окончания пилота</label>
          <input type="date" id="f-presale-pilotEnd" value="${escapeHtml(presale.pilotEnd || "")}"${ro}></div>
        <div><label>Дата выдачи дистрибутива</label>
          <input type="date" id="f-presale-distroIssueDate" value="${escapeHtml(presale.distroIssueDate || "")}"${ro}></div>
        <div><label>Дата окончания дистрибутива</label>
          <input type="date" id="f-presale-distroEndDate" value="${escapeHtml(presale.distroEndDate || "")}"${ro}></div>
      </div>
      <div id="presale-loss-wrap" class="presale-loss-wrap${lossVisible ? "" : " hidden"}">
        <div class="form-grid form-grid-2">
          <div><label>Причина отказа (пре-сейл) <span class="req">*</span></label>
            <select id="f-presale-lossReason"${ro}>
              <option value="">—</option>
              ${presaleLossReasonOptions().map(r =>
                `<option value="${escapeHtml(r)}"${r === (presale.lossReason || "") ? " selected" : ""}>${escapeHtml(r)}</option>`).join("")}
            </select></div>
          <div><label>В воронке продаж</label>
            <select id="f-presale-salesRejectMode"${ro}>
              ${Object.entries(window.ITMEN_PRESALE_SALES_REJECT_MODES || {}).map(([k, label]) =>
                `<option value="${escapeHtml(k)}"${(presale.salesRejectMode || "none") === k ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
            </select></div>
          <div class="span-2"><label>Описание причины</label>
            <textarea id="f-presale-lossComment" rows="3"${ro}>${escapeHtml(presale.lossComment || "")}</textarea></div>
        </div>
      </div>
      ${presale.kaitenCardUrl ? `<p class="muted small">Kaiten: <a href="${escapeHtml(presale.kaitenCardUrl)}" target="_blank" rel="noopener">${escapeHtml(presale.kaitenCardUrl)}</a>${presale.kaitenSyncedAt ? ` · sync ${escapeHtml(String(presale.kaitenSyncedAt).slice(0, 19).replace("T", " "))}` : ""}${presale.kaitenSyncError ? ` · <span class="text-danger">${escapeHtml(presale.kaitenSyncError)}</span>` : ""}</p>` : (presale.kaitenSyncError ? `<p class="muted small text-danger">Kaiten: ${escapeHtml(presale.kaitenSyncError)}</p>` : "")}
    </div>`;
}

function collectPresaleFromDom() {
  return {
    owner: val("f-presale-owner"),
    stage: val("f-presale-stage"),
    successWithoutPilot: Boolean(document.getElementById("f-presale-successWithoutPilot")?.checked),
    pilotStart: val("f-presale-pilotStart"),
    pilotEnd: val("f-presale-pilotEnd"),
    distroIssueDate: val("f-presale-distroIssueDate"),
    distroEndDate: val("f-presale-distroEndDate"),
    lossReason: val("f-presale-lossReason"),
    lossComment: val("f-presale-lossComment"),
    salesRejectMode: val("f-presale-salesRejectMode") || "none",
  };
}

function togglePresaleLossFields() {
  const stage = val("f-presale-stage") || val("deal-page-presale-stage");
  const wrap = document.getElementById("presale-loss-wrap");
  if (!wrap) return;
  const isLoss = stage === (window.ITMEN_PRESALE_STAGE_OTKAZ || "Отказ");
  wrap.classList.toggle("hidden", !isLoss);
}

function bindPresaleMainForm(dealId) {
  const stageSel = document.getElementById("f-presale-stage");
  const headerStage = document.getElementById("deal-page-presale-stage");
  [stageSel, headerStage].forEach(el => {
    if (!el || el.dataset.presaleBound) return;
    el.dataset.presaleBound = "1";
    el.addEventListener("change", () => {
      if (stageSel && headerStage && el === stageSel) headerStage.value = stageSel.value;
      if (stageSel && headerStage && el === headerStage) stageSel.value = headerStage.value;
      togglePresaleLossFields();
      if (typeof markDealPageDirty === "function") markDealPageDirty();
    });
  });
  document.getElementById("f-presale-successWithoutPilot")?.addEventListener("change", () => {
    if (typeof markDealPageDirty === "function") markDealPageDirty();
  });
  togglePresaleLossFields();
}

async function loadPresaleEventsPanel(dealId, panel) {
  const cache = window.dealCrmCache || (window.dealCrmCache = {});
  if (!cache[dealId]) cache[dealId] = await apiLoadDealCrm(dealId);
  const presaleData = await apiLoadPresaleActivities(dealId);
  const crm = typeof mergePresaleActivitiesIntoCrm === "function"
    ? mergePresaleActivitiesIntoCrm(cache[dealId], presaleData.items)
    : cache[dealId];
  panel.innerHTML = typeof renderDealActivityTimeline === "function"
    ? renderDealActivityTimeline(crm, "presale")
    : `<p class="muted">Лента недоступна</p>`;
  const tasksPin = document.getElementById("deal-page-tasks-pin");
  if (tasksPin) {
    const pinHtml = typeof renderDealOpenTasksPin === "function" ? renderDealOpenTasksPin(crm, "presale") : "";
    if (pinHtml) {
      tasksPin.hidden = false;
      tasksPin.innerHTML = pinHtml;
    } else {
      tasksPin.hidden = true;
      tasksPin.innerHTML = "";
    }
  }
  bindDealActivityEvents(dealId, refreshDealPageRightPanel, { mode: "presale" });
  scrollDealFeedToBottom();
}

async function savePresaleFromDealPage(dealId) {
  const patch = collectPresaleFromDom();
  const stage = patch.stage;
  const otkaz = window.ITMEN_PRESALE_STAGE_OTKAZ || "Отказ";
  if (stage === otkaz && !String(patch.lossReason || "").trim()) {
    throw new Error("Укажите причину отказа пре-сейла");
  }
  if (window.ITMEN_PRESALE_LOSS_REQUIRES_COMMENT?.has?.(patch.lossReason) && !String(patch.lossComment || "").trim()) {
    throw new Error("Укажите описание причины отказа");
  }
  const res = await apiSavePresale(dealId, patch);
  const idx = typeof findDealIdxById === "function" ? findDealIdxById(dealId) : -1;
  if (idx >= 0 && res?.deal) {
    state.deals[idx] = typeof migrateDeal === "function" ? migrateDeal(res.deal) : res.deal;
    persistStateCache?.(state);
  } else if (idx >= 0 && res?.presale) {
    state.deals[idx].presale = res.presale;
    if (res.presale.stage) state.deals[idx].presale_stage = res.presale.stage;
    if (res.presale.owner) state.deals[idx].presale_owner = res.presale.owner;
    persistStateCache?.(state);
  }
  if (typeof updateDealPageHeaderAfterSave === "function") {
    const idx2 = typeof findDealIdxById === "function" ? findDealIdxById(dealId) : -1;
    if (idx2 >= 0) updateDealPageHeaderAfterSave(state.deals[idx2]);
  }
  return res;
}

function renderDealSubsectionsNav(activeTab) {
  const tabs = typeof DEAL_SUBSECTIONS !== "undefined" ? DEAL_SUBSECTIONS : [];
  const cur = activeTab || "passport";
  return `
    <div class="deal-page-subsections">
      <label class="deal-page-subsections-label muted">Подразделы
        <select id="deal-page-subsection-select" class="deal-page-subsection-select">
          ${tabs.map(t => `<option value="${escapeHtml(t.id)}"${t.id === cur ? " selected" : ""}>${escapeHtml(t.label)}</option>`).join("")}
        </select>
      </label>
    </div>`;
}

window.renderPresaleStagePill = renderPresaleStagePill;
window.renderPresaleMainTab = renderPresaleMainTab;
window.bindPresaleMainForm = bindPresaleMainForm;
window.loadPresaleEventsPanel = loadPresaleEventsPanel;
window.savePresaleFromDealPage = savePresaleFromDealPage;
window.renderDealSubsectionsNav = renderDealSubsectionsNav;
window.togglePresaleLossFields = togglePresaleLossFields;
window.presaleDisplayStage = presaleDisplayStage;
