/* Вкладки CRM в модалке сделки */
let dealCrmCache = {};
let dealModalTab = "passport";
let dealPassportHtml = "";

const DEAL_TABS = [
  { id: "passport", label: "Паспорт" },
  { id: "events", label: "События" },
  { id: "files", label: "Файлы" },
  { id: "info", label: "Общая информация" },
  { id: "contacts", label: "Контакты" },
];

function storeDealPassportHtml() {
  const body = document.querySelector("#deal-modal .modal-body");
  if (body) dealPassportHtml = body.innerHTML;
}

function renderDealModalTabs() {
  const modal = document.getElementById("deal-modal");
  if (!modal) return;
  let bar = modal.querySelector(".deal-tabs");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "deal-tabs";
    modal.querySelector(".modal-header")?.after(bar);
  }
  bar.innerHTML = DEAL_TABS.map(t =>
    `<button type="button" class="deal-tab${dealModalTab === t.id ? " active" : ""}" data-tab="${t.id}">${t.label}</button>`
  ).join("");
  bar.querySelectorAll(".deal-tab").forEach(btn => {
    btn.onclick = () => switchDealTab(btn.dataset.tab);
  });
}

function restorePassportTab() {
  const body = document.querySelector("#deal-modal .modal-body");
  if (!body || !dealPassportHtml) return;
  body.innerHTML = dealPassportHtml;
  if (typeof toggleBudgetPlannedDate === "function") toggleBudgetPlannedDate();
  if (typeof toggleLossReasonField === "function") toggleLossReasonField();
  const idx = editingDealIdx;
  const editable = idx == null ? true : canEditDeal(state.deals[idx]);
  if (typeof applyDealModalReadOnly === "function") applyDealModalReadOnly(editable);
}

async function switchDealTab(tab) {
  const body = document.querySelector("#deal-modal .modal-body");
  if (dealModalTab === "passport" && body) storeDealPassportHtml();
  dealModalTab = tab;
  renderDealModalTabs();
  if (!body) return;
  if (tab === "passport") {
    restorePassportTab();
    return;
  }
  const dealId = document.getElementById("f-id")?.value;
  if (!dealId) {
    body.innerHTML = `<p class="muted">Сначала сохраните сделку, чтобы открыть вкладку «${escapeHtml(DEAL_TABS.find(t => t.id === tab)?.label || tab)}»</p>`;
    return;
  }
  body.innerHTML = `<p class="muted">Загрузка…</p>`;
  try {
    if (!dealCrmCache[dealId]) {
      dealCrmCache[dealId] = await apiLoadDealCrm(dealId);
    }
    const crm = dealCrmCache[dealId];
    if (tab === "events") body.innerHTML = renderEventsTab(dealId, crm);
    else if (tab === "files") body.innerHTML = renderFilesTab(dealId, crm);
    else if (tab === "contacts") body.innerHTML = renderContactsTab(dealId, crm);
    else if (tab === "info") body.innerHTML = renderInfoTab(dealId, crm);
    bindDealCrmTabEvents(dealId, tab);
  } catch (e) {
    body.innerHTML = `<p class="muted" style="color:#b45309">${escapeHtml(e.message)}</p>`;
  }
}

function activityIcon(type) {
  const m = {
    comment: "💬", stage_change: "↔️", task_created: "✅", task_done: "✔️",
    file_uploaded: "📎", owner_changed: "👤", archive: "📦", loss_reason: "✖️",
  };
  return m[type] || "•";
}

function dealTabCanEdit() {
  return editingDealIdx == null ? true : canEditDeal(state.deals[editingDealIdx]);
}

function renderEventsTab(dealId, crm) {
  const items = (crm.activities || []).map(a => `
    <div class="feed-item feed-${a.type}">
      <div class="feed-meta">${activityIcon(a.type)} <strong>${escapeHtml(a.author || "—")}</strong>
        <span class="muted">${escapeHtml((a.at || "").slice(0, 16).replace("T", " "))}</span></div>
      <div class="feed-body">${escapeHtml(a.body || "")}</div>
    </div>`).join("");
  const canEdit = dealTabCanEdit();
  const tasks = (crm.tasks || []).map(t => `
    <div class="task-row" data-id="${t.id}">
      <label><input type="checkbox" class="task-done-cb" ${t.status === "done" ? "checked" : ""} ${canEdit ? "" : "disabled"}>
        <span class="${t.status === "done" ? "done" : ""}">${escapeHtml(t.title)}</span></label>
      <span class="muted">${escapeHtml(t.dueAt ? t.dueAt.slice(0, 16).replace("T", " ") : "—")} · ${escapeHtml(t.assignee || "—")}</span>
      ${canEdit ? `<button type="button" class="btn btn-sm task-del">✕</button>` : ""}
    </div>`).join("");
  return `
    <div class="events-layout">
      <div class="form-section-title">Лента событий</div>
      <div class="feed-list">${items || "<p class='muted'>Пока нет событий</p>"}</div>
      ${canEdit ? `<div class="feed-compose">
        <textarea id="feed-comment" rows="3" placeholder="Комментарий…"></textarea>
        <button type="button" class="btn btn-primary btn-sm" id="feed-send">Добавить комментарий</button>
      </div>` : ""}
      <div class="form-section-title" style="margin-top:1.25rem">Задачи</div>
      <div class="task-list">${tasks || "<p class='muted'>Нет задач</p>"}</div>
      ${canEdit ? `<div class="task-form">
        <input id="task-title" placeholder="Задача / напоминание">
        <input type="datetime-local" id="task-due">
        <select id="task-assignee">${(state.lists?.owners || []).map(o =>
          `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}</select>
        <button type="button" class="btn btn-primary btn-sm" id="task-add">Добавить задачу</button>
      </div>` : ""}
      <div class="form-section-title" style="margin-top:1.25rem">Прикрепить файл</div>
      <p class="muted" style="font-size:.8rem">Файлы сохраняются во вкладке «Файлы»</p>
      ${canEdit ? `<div class="file-form">
        <select id="event-file-label"><option>ТЗ</option><option>КП</option><option>Договор</option><option>Прочее</option></select>
        <input type="file" id="event-file-input">
        <button type="button" class="btn btn-primary btn-sm" id="event-file-upload">Загрузить</button>
      </div>` : ""}
    </div>`;
}

function renderFilesTab(dealId, crm) {
  const canEdit = dealTabCanEdit();
  const rows = (crm.files || []).map(f => `
    <div class="file-row">
      <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener">${escapeHtml(f.originalName || f.label)}</a>
      <span class="muted">${escapeHtml(f.label)} · ${Math.round((f.size || 0) / 1024)} KB</span>
      ${canEdit ? `<button type="button" class="btn btn-sm file-del" data-id="${f.id}">✕</button>` : ""}
    </div>`).join("");
  return `
    <div class="file-list">${rows || "<p class='muted'>Нет файлов</p>"}</div>
    ${canEdit ? `<div class="file-form">
      <select id="file-label"><option>ТЗ</option><option>КП</option><option>Договор</option><option>Прочее</option></select>
      <input type="file" id="file-input">
      <button type="button" class="btn btn-primary btn-sm" id="file-upload">Загрузить</button>
    </div>` : ""}`;
}

function renderContactsTab(dealId, crm) {
  const contacts = crm.contacts?.length ? crm.contacts : [{ name: "", email: "", phone: "", role: "" }];
  const canEdit = dealTabCanEdit();
  const rows = contacts.map((c, i) => `
    <div class="contact-row" data-i="${i}">
      <input class="c-name" value="${escapeHtml(c.name)}" placeholder="ФИО" ${canEdit ? "" : "disabled"}>
      <input class="c-email" value="${escapeHtml(c.email)}" placeholder="Email" ${canEdit ? "" : "disabled"}>
      <input class="c-phone" value="${escapeHtml(c.phone)}" placeholder="Телефон" ${canEdit ? "" : "disabled"}>
      <input class="c-role" value="${escapeHtml(c.role)}" placeholder="Роль" ${canEdit ? "" : "disabled"}>
    </div>`).join("");
  return `
    <div id="contacts-wrap">${rows}</div>
    ${canEdit ? `<button type="button" class="btn btn-sm" id="contact-add">+ Контакт</button>
    <button type="button" class="btn btn-primary btn-sm" id="contacts-save">Сохранить контакты</button>` : ""}`;
}

function renderInfoTab(dealId, crm) {
  const i = crm.info || {};
  const canEdit = dealTabCanEdit();
  const dis = canEdit ? "" : "disabled";
  return `
    <div class="form-section"><div class="form-section-title">Общая информация по клиенту</div>
      <div class="form-grid">
        <div><label>Название ЮЛ</label><input id="info-company" value="${escapeHtml(i.companyName)}" ${dis}></div>
        <div><label>ИНН</label><input id="info-inn" value="${escapeHtml(i.companyInn)}" ${dis}></div>
        <div><label>КПП</label><input id="info-kpp" value="${escapeHtml(i.companyKpp)}" ${dis}></div>
        <div><label>ОГРН</label><input id="info-ogrn" value="${escapeHtml(i.companyOgrn)}" ${dis}></div>
        <div class="span-2"><label>Сайт</label><input id="info-website" value="${escapeHtml(i.website)}" ${dis}></div>
      </div>
    </div>
    <div class="form-section"><div class="form-section-title">Источники / UTM</div>
      <div class="form-grid">
        <div><label>Канал</label><input id="info-channel" value="${escapeHtml(i.sourceChannel)}" ${dis}></div>
        <div><label>utm_source</label><input id="info-utm-source" value="${escapeHtml(i.utmSource)}" ${dis}></div>
        <div><label>utm_medium</label><input id="info-utm-medium" value="${escapeHtml(i.utmMedium)}" ${dis}></div>
        <div><label>utm_campaign</label><input id="info-utm-campaign" value="${escapeHtml(i.utmCampaign)}" ${dis}></div>
        <div><label>Лендинг</label><input id="info-landing" value="${escapeHtml(i.landingPage)}" ${dis}></div>
        <div><label>Referrer</label><input id="info-referrer" value="${escapeHtml(i.referrer)}" ${dis}></div>
      </div>
    </div>
    ${canEdit ? `<button type="button" class="btn btn-primary btn-sm" id="info-save">Сохранить</button>` : ""}`;
}

function collectContactsFromDom() {
  return [...document.querySelectorAll("#contacts-wrap .contact-row")].map(row => ({
    name: row.querySelector(".c-name")?.value || "",
    email: row.querySelector(".c-email")?.value || "",
    phone: row.querySelector(".c-phone")?.value || "",
    role: row.querySelector(".c-role")?.value || "",
  })).filter(c => c.name || c.email || c.phone);
}

function collectInfoFromDom() {
  return {
    companyName: document.getElementById("info-company")?.value || "",
    companyInn: document.getElementById("info-inn")?.value || "",
    companyKpp: document.getElementById("info-kpp")?.value || "",
    companyOgrn: document.getElementById("info-ogrn")?.value || "",
    website: document.getElementById("info-website")?.value || "",
    sourceChannel: document.getElementById("info-channel")?.value || "",
    utmSource: document.getElementById("info-utm-source")?.value || "",
    utmMedium: document.getElementById("info-utm-medium")?.value || "",
    utmCampaign: document.getElementById("info-utm-campaign")?.value || "",
    landingPage: document.getElementById("info-landing")?.value || "",
    referrer: document.getElementById("info-referrer")?.value || "",
  };
}

function bindDealCrmTabEvents(dealId, tab) {
  if (tab === "events") {
    document.getElementById("feed-send")?.addEventListener("click", async () => {
      const body = document.getElementById("feed-comment")?.value?.trim();
      if (!body) return;
      await apiPostComment(dealId, body);
      delete dealCrmCache[dealId];
      await switchDealTab("events");
      showToast("Комментарий добавлен");
    });
    document.getElementById("task-add")?.addEventListener("click", async () => {
      const title = document.getElementById("task-title")?.value?.trim();
      if (!title) return;
      let dueAt = document.getElementById("task-due")?.value || null;
      if (dueAt && dueAt.length === 16) dueAt += ":00";
      await apiSaveTask(dealId, {
        title,
        dueAt,
        assignee: document.getElementById("task-assignee")?.value || "",
        status: "open",
      });
      delete dealCrmCache[dealId];
      await switchDealTab("events");
      showToast("Задача добавлена");
    });
    document.querySelectorAll(".task-done-cb").forEach(cb => {
      cb.onchange = async () => {
        const row = cb.closest(".task-row");
        const task = dealCrmCache[dealId]?.tasks?.find(t => t.id === row?.dataset.id);
        if (!task) return;
        await apiSaveTask(dealId, { ...task, status: cb.checked ? "done" : "open", doneAt: cb.checked ? new Date().toISOString() : null });
        delete dealCrmCache[dealId];
        await switchDealTab("events");
      };
    });
    document.querySelectorAll(".task-del").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest(".task-row")?.dataset.id;
        if (!id || !confirm("Удалить задачу?")) return;
        await apiDeleteTask(dealId, id);
        delete dealCrmCache[dealId];
        await switchDealTab("events");
      };
    });
    document.getElementById("event-file-upload")?.addEventListener("click", async () => {
      const f = document.getElementById("event-file-input")?.files?.[0];
      if (!f) return alert("Выберите файл");
      await apiUploadDealFile(dealId, f, document.getElementById("event-file-label")?.value);
      delete dealCrmCache[dealId];
      await switchDealTab("events");
      showToast("Файл загружен — см. вкладку «Файлы»");
    });
  }
  if (tab === "files") {
    document.getElementById("file-upload")?.addEventListener("click", async () => {
      const f = document.getElementById("file-input")?.files?.[0];
      if (!f) return alert("Выберите файл");
      await apiUploadDealFile(dealId, f, document.getElementById("file-label")?.value);
      delete dealCrmCache[dealId];
      await switchDealTab("files");
      showToast("Файл загружен");
    });
    document.querySelectorAll(".file-del").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Удалить файл?")) return;
        await apiDeleteDealFile(dealId, btn.dataset.id);
        delete dealCrmCache[dealId];
        await switchDealTab("files");
      };
    });
  }
  if (tab === "contacts") {
    document.getElementById("contact-add")?.onclick = () => {
      document.getElementById("contacts-wrap")?.insertAdjacentHTML("beforeend",
        `<div class="contact-row"><input class="c-name" placeholder="ФИО"><input class="c-email" placeholder="Email"><input class="c-phone" placeholder="Телефон"><input class="c-role" placeholder="Роль"></div>`);
    };
    document.getElementById("contacts-save")?.onclick = async () => {
      await apiSaveContacts(dealId, collectContactsFromDom());
      delete dealCrmCache[dealId];
      showToast("Контакты сохранены");
    };
  }
  if (tab === "info") {
    document.getElementById("info-save")?.onclick = async () => {
      await apiSaveDealInfo(dealId, collectInfoFromDom());
      delete dealCrmCache[dealId];
      showToast("Информация сохранена");
    };
  }
}

function invalidateDealCrmCache(dealId) {
  if (dealId) delete dealCrmCache[dealId];
  else dealCrmCache = {};
}

window.renderDealModalTabs = renderDealModalTabs;
window.switchDealTab = switchDealTab;
window.storeDealPassportHtml = storeDealPassportHtml;
window.invalidateDealCrmCache = invalidateDealCrmCache;
window.dealModalTab = () => dealModalTab;
