/* Вкладки CRM в модалке сделки */
function getDealCrmCache() {
  if (!window.dealCrmCache) window.dealCrmCache = {};
  return window.dealCrmCache;
}

var dealCrmCache = getDealCrmCache();
window.dealCrmCache = dealCrmCache;
let dealModalTab = "passport";
let dealPassportHtml = "";
let dealModalDealId = "";

function getDealModalDealId() {
  const modal = document.getElementById("deal-modal");
  return (modal?.dataset.dealId || "").trim()
    || dealModalDealId
    || document.getElementById("f-id")?.value?.trim()
    || (editingDealIdx != null ? state?.deals?.[editingDealIdx]?.id : "")
    || "";
}

function setDealModalDealId(id) {
  dealModalDealId = id || "";
  const modal = document.getElementById("deal-modal");
  if (modal) modal.dataset.dealId = dealModalDealId;
}

const DEAL_TABS = [
  { id: "passport", label: "Паспорт" },
  { id: "pilot-req", label: "Пилот" },
  { id: "product-req", label: "Продукт" },
  { id: "events", label: "События" },
  { id: "files", label: "Файлы" },
  { id: "info", label: "Общая информация" },
  { id: "contacts", label: "Контакты" },
];

function initDealModalTabs() {
  const wrap = document.getElementById("deal-tabs-wrap");
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = "1";
  wrap.addEventListener("click", e => {
    const btn = e.target.closest(".deal-tab");
    if (!btn?.dataset.tab) return;
    e.preventDefault();
    e.stopPropagation();
    switchDealTab(btn.dataset.tab);
  });
}

function renderDealModalTabs() {
  const bar = document.getElementById("deal-tabs");
  if (!bar) return;
  bar.querySelectorAll(".deal-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === dealModalTab);
  });
}

function storeDealPassportHtml() {
  const body = document.querySelector("#deal-modal .modal-body");
  if (body) dealPassportHtml = body.innerHTML;
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
  if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(body);
}

async function switchDealTab(tab) {
  if (!tab) return;
  const body = document.querySelector("#deal-modal .modal-body");
  if (!body) return;
  if (dealModalTab === "passport" && tab !== "passport") storeDealPassportHtml();
  dealModalTab = tab;
  renderDealModalTabs();
  if (tab === "passport") {
    restorePassportTab();
    return;
  }
  const dealId = getDealModalDealId();
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
    else if (tab === "pilot-req") {
      const data = await apiLoadPilotRequirements(dealId);
      const idx = editingDealIdx;
      const editable = idx == null ? true : canEditDeal(state.deals[idx]);
      body.innerHTML = renderPilotRequirementsTab(dealId, data, editable);
      bindPilotRequirementsEvents(dealId, editable);
      if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(body);
    } else if (tab === "product-req") {
      const data = await apiLoadProductRequirements(dealId);
      const idx = editingDealIdx;
      const editable = idx == null ? true : canEditDeal(state.deals[idx]);
      body.innerHTML = renderProductRequirementsTab(dealId, data, editable);
      bindProductRequirementsEvents(dealId, editable);
      if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(body);
    }
    bindDealCrmTabEvents(dealId, tab);
  } catch (e) {
    console.error("switchDealTab:", e);
    body.innerHTML = `<p class="muted" style="color:#b45309">${escapeHtml(e.message || String(e))}</p>`;
    if (typeof showToast === "function") showToast("Ошибка загрузки вкладки");
  }
}

function cleanAmoImportText(text) {
  if (!text) return "";
  return String(text)
    .replace(/^amo_task_done:\d+\s*\n?/i, "")
    .replace(/^amo:note:\d+\s*\n?/i, "")
    .replace(/^AmoFile:\d+\s*\n?/i, "")
    .trim();
}

function activityIcon(type) {
  const m = {
    comment: "💬", stage_change: "↔️", field_change: "↔️", contacts_change: "👤", info_change: "ℹ️", task_created: "✅", task_done: "✔️",
    task_rescheduled: "🕐", file_uploaded: "📎", kp_issued: "📄", owner_changed: "👤", archive: "📦", loss_reason: "✖️",
    presale_note: "🧪",
  };
  return m[type] || "•";
}

function dealTabCanEdit() {
  if (editingDealIdx == null) return true;
  const deal = state.deals[editingDealIdx];
  const left = typeof getDealPageLeftTab === "function" ? getDealPageLeftTab() : "passport";
  const right = typeof getDealPageRightTab === "function" ? getDealPageRightTab() : "events";
  const rightTabs = typeof RIGHT_PANEL_TABS !== "undefined"
    ? RIGHT_PANEL_TABS
    : new Set(["pilot-req", "product-req", "presale-events", "kp-calc"]);
  const tab = rightTabs.has(right) ? right : left;
  if (typeof canEditDealTab === "function") return canEditDealTab(tab, deal);
  return canEditDeal(deal);
}

function taskAssigneeOptions() {
  const owners = state?.lists?.owners || [];
  if (typeof isAdmin === "function" && isAdmin()) return owners;
  const self = window.ITMEN_AUTH?.user?.managerName || "";
  return self ? [self] : [];
}

function resolveClientTaskAssignee(requested) {
  const options = taskAssigneeOptions();
  if (typeof isAdmin === "function" && isAdmin()) {
    return (requested || options[0] || "").trim();
  }
  return (window.ITMEN_AUTH?.user?.managerName || "").trim();
}

function renderTaskAssigneeField() {
  const options = taskAssigneeOptions();
  const self = options[0] || "";
  if (!options.length) {
    return `<span class="muted" style="font-size:.82rem">Исполнитель не задан</span>`;
  }
  if (options.length === 1) {
    return `<input type="hidden" id="task-assignee" value="${escapeHtml(self)}">
      <span class="task-assignee-self muted" style="font-size:.82rem;white-space:nowrap">На себя: <strong>${escapeHtml(self)}</strong></span>`;
  }
  return `<select id="task-assignee">${options.map(o =>
    `<option value="${escapeHtml(o)}"${o === self ? " selected" : ""}>${escapeHtml(o)}</option>`
  ).join("")}</select>`;
}

function resolveCrmPersonDisplayName(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "amo-sync" || s === "amo") return s;
  const amoById = window.ITMEN_AMO_USER_BY_ID || {};
  if (/^\d+$/.test(s) && amoById[s]) return amoById[s];
  const amoOverrides = { "12718890": "Аркадий Мерлейн" };
  if (/^\d+$/.test(s) && amoOverrides[s]) return amoOverrides[s];
  const aliases = window.ITMEN_AMO_PRESALE_OWNER_ALIASES || {};
  const key = s.toLowerCase().replace(/\s+/g, " ");
  if (aliases[key]) return aliases[key];
  const parts = key.split(" ").filter(Boolean);
  if (parts.length === 2) {
    const rev = `${parts[1]} ${parts[0]}`;
    if (aliases[rev]) return aliases[rev];
  }
  const owners = typeof ownerSelectOptions === "function" ? ownerSelectOptions(s) : (state?.lists?.owners || []);
  const norm = v => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  const hit = owners.find(o => norm(o) === key);
  if (hit) return hit;
  if (parts.length === 2) {
    const rev = `${parts[1]} ${parts[0]}`;
    const hitRev = owners.find(o => norm(o) === rev);
    if (hitRev) return hitRev;
  }
  if (/^\d+$/.test(s)) return s;
  return s;
}

function renderAmoFeedAttachments(meta) {
  const files = meta?.files || [];
  if (!files.length) return "";
  return `<div class="amo-feed-attachments">${files.map(f => `
    <button type="button" class="amo-feed-file" data-file-id="${escapeHtml(f.id)}" title="${escapeHtml(f.name || "")}">
      <span class="amo-feed-file-icon">📎</span>
      <span class="amo-feed-file-name">${escapeHtml(f.name || "Файл")}</span>
    </button>`).join("")}</div>`;
}

function feedDateLabel(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return typeof formatRuDate === "function" ? formatRuDate(iso) : String(iso).slice(0, 10);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return "Сегодня";
  if (day.getTime() === yest.getTime()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function feedTimeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(11, 16);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function feedDayKey(iso) {
  if (!iso) return "";
  if (typeof mskDateKey === "function") return isoDateKeyToRu(mskDateKey(iso));
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return typeof formatRuDate === "function" ? formatRuDate(iso) : String(iso).slice(0, 10);
  return typeof formatRuDate === "function" ? formatRuDate(iso) : d.toISOString().slice(0, 10);
}

function formatTaskCreatedLabel(iso) {
  if (!iso) return "";
  if (typeof formatRuDateTime === "function") return formatRuDateTime(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace("T", " ");
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function parseOpenTaskDueAt(raw) {
  if (typeof parseMskDateTime === "function") return parseMskDateTime(raw);
  const s = String(raw || "").trim();
  if (!s) return null;
  const norm = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
  const d = new Date(norm);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isOpenTaskOverdue(t) {
  if (typeof isTaskOverdueMsk === "function") return isTaskOverdueMsk(t?.dueAt, t?.status);
  if (!t || t.status === "done") return false;
  const d = parseOpenTaskDueAt(t.dueAt);
  if (!d) return false;
  return Date.now() > d.getTime();
}

function renderAmoOpenTaskCard(t, canEdit, canEditDue) {
  const dueEditable = canEdit && canEditDue !== false;
  const due = typeof formatMskDateTimeLabel === "function"
    ? formatMskDateTimeLabel(t.dueAt)
    : (t.dueAt ? t.dueAt.slice(0, 16).replace("T", " ") : "—");
  const dueInput = typeof toDatetimeLocalMsk === "function"
    ? toDatetimeLocalMsk(t.dueAt)
    : (t.dueAt ? t.dueAt.slice(0, 16) : "");
  const created = t.createdAt ? formatTaskCreatedLabel(t.createdAt) : "";
  const overdue = isOpenTaskOverdue(t);
  return `
    <div class="amo-task-card amo-task-open${overdue ? " overdue" : ""}" data-id="${escapeHtml(t.id)}">
      <div class="amo-task-card-title">${escapeHtml(t.title)}</div>
      <div class="amo-task-card-foot">
        <div class="amo-task-card-meta">
          <span class="amo-task-who">${escapeHtml(resolveCrmPersonDisplayName(t.assignee) || "—")}</span>
          ${created ? `<span class="amo-task-created muted" title="Дата заведения">📅 ${escapeHtml(created)}</span>` : ""}
          ${dueEditable
            ? `<button type="button" class="amo-task-due-btn muted" data-due="${escapeHtml(dueInput)}" title="Изменить срок">⏰ ${escapeHtml(due)}</button>`
            : `<span class="muted" title="Срок">⏰ ${escapeHtml(due)}</span>`}
          ${overdue ? `<span class="amo-task-overdue-badge">Просрочена</span>` : ""}
        </div>
        ${canEdit ? `<button type="button" class="btn btn-sm amo-task-done">Выполнить</button>` : ""}
      </div>
      ${dueEditable ? `<div class="amo-task-reschedule-row" hidden>
        <input type="datetime-local" class="amo-task-due-input" value="${escapeHtml(dueInput)}">
        <input type="text" class="amo-task-reschedule-comment" placeholder="Причина переноса (обязательно)">
        <button type="button" class="btn btn-sm btn-primary amo-task-reschedule-save">Сохранить</button>
        <button type="button" class="btn btn-sm amo-task-reschedule-cancel">Отмена</button>
      </div>` : ""}
      ${canEdit ? `<div class="amo-task-result-row" hidden>
        <input type="text" class="amo-task-result-input" placeholder="введите результат">
        <button type="button" class="btn btn-sm btn-primary amo-task-result-save">Сохранить</button>
      </div>` : ""}
    </div>`;
}

function renderAmoTimelineItem(item) {
  if (item.kind === "date") {
    return `<div class="amo-feed-date"><span>${escapeHtml(item.label)}</span></div>`;
  }
  if (item.kind === "task_done") {
    const t = item.task;
    const created = t.createdAt ? formatTaskCreatedLabel(t.createdAt) : "";
    return `
      <div class="amo-feed-item amo-feed-task-done" data-id="${escapeHtml(t.id)}">
        <div class="amo-feed-line"></div>
        <div class="amo-feed-bubble">
          <div class="amo-feed-head"><span class="amo-feed-check">✓</span>
            <strong>${escapeHtml(resolveCrmPersonDisplayName(t.assignee || item.author) || "—")}</strong>
            <span class="muted">${escapeHtml(feedTimeLabel(item.at))}</span></div>
          <div class="amo-feed-text">${escapeHtml(t.title)}</div>
          ${created ? `<div class="amo-task-created-line muted">Заведена: ${escapeHtml(created)}</div>` : ""}
          ${t.result ? `<div class="amo-feed-result">${escapeHtml(cleanAmoImportText(t.result))}</div>` : ""}
        </div>
      </div>`;
  }
  const a = item.activity;
  const sys = ["stage_change", "owner_changed", "archive", "loss_reason", "task_rescheduled", "field_change", "contacts_change", "info_change"].includes(a.type);
  const kpIssued = a.type === "kp_issued";
  const taskCreatedLine = a.type === "task_created" && a.meta?.createdAt
    ? `<div class="amo-task-created-line muted">Заведена: ${escapeHtml(formatTaskCreatedLabel(a.meta.createdAt))}</div>`
    : "";
  return `
    <div class="amo-feed-item amo-feed-${a.type}${sys ? " amo-feed-system" : ""}">
      <div class="amo-feed-line"></div>
      <div class="amo-feed-bubble">
        <div class="amo-feed-head">${sys && !kpIssued ? "" : `<span class="amo-feed-icon">${activityIcon(a.type)}</span>`}
          <strong>${escapeHtml(resolveCrmPersonDisplayName(a.author) || "—")}</strong>
          <span class="muted">${escapeHtml(feedTimeLabel(a.at))}</span></div>
        <div class="amo-feed-text">${escapeHtml(cleanAmoImportText(a.body || ""))}</div>
        ${taskCreatedLine}
        ${renderAmoFeedAttachments(a.meta)}
      </div>
    </div>`;
}

function buildAmoTimeline(crm, audience) {
  const filtered = typeof filterCrmForFeedAudience === "function"
    ? filterCrmForFeedAudience(crm, audience)
    : crm;
  const activityRefs = new Set((filtered.activities || []).map(a => String(a.refId || "")));
  const items = [];
  (filtered.activities || []).forEach(a => {
    items.push({ kind: "activity", at: a.at, activity: a, sortKey: `${a.at || ""}|a|${a.id || a.refId || ""}` });
  });
  (filtered.tasks || []).filter(t => t.status === "done").forEach(t => {
    const amoDoneRef = String(t.activityId || "").startsWith("amo:task:")
      ? `${t.activityId}:done`
      : "";
    if (amoDoneRef && activityRefs.has(amoDoneRef)) return;
    if (activityRefs.has(String(t.id))) return;
    items.push({
      kind: "task_done",
      at: t.doneAt || t.dueAt || t.createdAt,
      task: t,
      author: t.assignee,
      sortKey: `${t.doneAt || t.dueAt || t.createdAt || ""}|t|${t.id || ""}`,
    });
  });
  items.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  const out = [];
  let lastDay = "";
  items.forEach(it => {
    const dk = feedDayKey(it.at);
    if (dk && dk !== lastDay) {
      out.push({ kind: "date", label: feedDateLabel(it.at) });
      lastDay = dk;
    }
    out.push(it);
  });
  return out;
}

const FEED_SYSTEM_TYPES = new Set([
  "stage_change", "owner_changed", "archive", "loss_reason", "task_rescheduled",
  "field_change", "contacts_change", "info_change", "file_uploaded", "kp_issued",
]);

function isPresaleFeedAuthor(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return false;
  const staff = typeof getPresaleStaffNames === "function" ? getPresaleStaffNames() : [];
  return staff.some(s => String(s).trim().toLowerCase() === n);
}

function isAmoCrmActivity(a) {
  if (!a) return false;
  if (String(a.refId || "").startsWith("amo:")) return true;
  const author = String(a.author || "").trim();
  if (author === "amo-sync" || author === "amo") return true;
  if (/^\d+$/.test(author)) return true;
  return Boolean(a.meta?.amo || a.meta?.amo_note_id || a.meta?.amo_lead_id);
}

function isAmoCrmTask(t) {
  if (!t) return false;
  if (String(t.activityId || "").startsWith("amo:task:")) return true;
  const who = String(t.assignee || t.createdBy || "").trim();
  if (who === "amo-sync") return true;
  if (/^\d+$/.test(who)) return true;
  return false;
}

function isKaitenOrPresaleActivity(a) {
  if (!a) return false;
  const t = String(a.type || "");
  if (t === "presale_note" || t === "kaiten_comment" || t === "kaiten_description") return true;
  if (a.meta?.fromKaiten || a.meta?.kaitenCardId || a.meta?.kaitenCommentId) return true;
  return isPresaleFeedAuthor(a.author);
}

function isManualManagerActivity(a) {
  if (!a || FEED_SYSTEM_TYPES.has(a.type)) return false;
  if (isAmoCrmActivity(a) || isKaitenOrPresaleActivity(a)) return false;
  if (a.type === "presale_note") return false;
  return !isPresaleFeedAuthor(a.author);
}

function isManagerFeedActivity(a) {
  if (!a) return false;
  if (isAmoCrmActivity(a)) return true;
  if (FEED_SYSTEM_TYPES.has(a.type)) return true;
  if (a.type === "comment" && !String(a.refId || "").startsWith("amo:")) return true;
  return isManualManagerActivity(a);
}

function isManualPresaleActivity(a) {
  if (!a || FEED_SYSTEM_TYPES.has(a.type)) return false;
  if (isAmoCrmActivity(a)) return false;
  if (isKaitenOrPresaleActivity(a)) return true;
  if (a.type === "presale_note") return true;
  return isPresaleFeedAuthor(a.author);
}

function filterCrmForFeedAudience(crm, audience) {
  const isPresale = audience === "presale";
  const activities = (crm?.activities || []).filter(a => {
    if (isPresale) {
      if (isAmoCrmActivity(a)) return false;
      return isManualPresaleActivity(a) || isKaitenOrPresaleActivity(a);
    }
    if (isKaitenOrPresaleActivity(a)) return false;
    return isManagerFeedActivity(a);
  });
  const tasks = (crm?.tasks || []).filter(t => {
    const amo = isAmoCrmTask(t);
    const presaleTask = isPresaleFeedAuthor(t.assignee);
    if (isPresale) {
      if (amo) return false;
      return presaleTask;
    }
    if (amo) return true;
    return !presaleTask;
  });
  return { ...(crm || {}), activities, tasks };
}

function mergePresaleActivitiesIntoCrm(crm, presaleEvents) {
  const presaleOnly = (presaleEvents || []).map(ev => ({
    id: ev.id,
    at: ev.at,
    type: ev.type || "presale_note",
    body: ev.body,
    author: ev.author,
    meta: ev.meta || {},
  }));
  const filtered = filterCrmForFeedAudience(crm, "presale");
  return {
    ...(crm || {}),
    activities: presaleOnly,
    tasks: filtered.tasks || [],
  };
}

function renderDealActivityTimeline(crm, audience) {
  const aud = audience || "manager";
  const filtered = typeof filterCrmForFeedAudience === "function"
    ? filterCrmForFeedAudience(crm, aud)
    : crm;
  const timeline = buildAmoTimeline(crm, aud);
  const openTasks = (filtered.tasks || []).filter(t => t.status !== "done");
  const noTaskHint = openTasks.length
    ? ""
    : `<p class="muted amo-feed-no-task">Задача отсутствует</p>`;
  const timelineHtml = timeline.length
    ? timeline.map(renderAmoTimelineItem).join("")
    : `<p class="muted amo-feed-empty">Пока нет событий</p>`;
  return `<div class="amo-feed-timeline">${timelineHtml}${noTaskHint}</div>`;
}

function renderDealOpenTasksPin(crm, audience) {
  const aud = audience || "manager";
  const filtered = typeof filterCrmForFeedAudience === "function"
    ? filterCrmForFeedAudience(crm, aud)
    : crm;
  const canEdit = dealTabCanEdit();
  const canEditDue = canEdit && aud !== "presale";
  const openTasks = (filtered.tasks || []).filter(t => t.status !== "done");
  if (!openTasks.length) return "";
  return `<div class="amo-feed-open-tasks">${openTasks.map(t => renderAmoOpenTaskCard(t, canEdit, canEditDue)).join("")}</div>`;
}

function renderDealActivityPanel(dealId, crm) {
  const openHtml = renderDealOpenTasksPin(crm);
  return `${openHtml}${renderDealActivityTimeline(crm)}`;
}

const AMO_TASK_DUE_PRESETS = [
  { id: "today", label: "Сегодня", days: 0, hour: 18 },
  { id: "tomorrow", label: "Завтра", days: 1, hour: 18 },
  { id: "week", label: "Через неделю", days: 7, hour: 18 },
  { id: "month", label: "Через месяц", days: 30, hour: 18 },
];

function computeTaskDueFromPreset(presetId) {
  const preset = AMO_TASK_DUE_PRESETS.find(p => p.id === presetId) || AMO_TASK_DUE_PRESETS[1];
  if (typeof addMskDays === "function") return addMskDays(preset.days, preset.hour);
  const d = new Date();
  d.setDate(d.getDate() + preset.days);
  d.setHours(preset.hour, 0, 0, 0);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00:00`;
}

function renderAmoTaskAssigneeInline() {
  const options = taskAssigneeOptions();
  const self = options[0] || "";
  if (!options.length) return `<span class="muted">—</span>`;
  if (options.length === 1) {
    return `<input type="hidden" id="task-assignee" value="${escapeHtml(self)}"><span class="amo-task-user">${escapeHtml(self)}</span>`;
  }
  return `<select id="task-assignee" class="amo-task-user-select">${options.map(o =>
    `<option value="${escapeHtml(o)}"${o === self ? " selected" : ""}>${escapeHtml(o)}</option>`
  ).join("")}</select>`;
}

function renderDealActivityCompose(canEdit) {
  if (!canEdit) return "";
  const defaultDue = AMO_TASK_DUE_PRESETS[1];
  return `
    <div class="amo-compose-bar" id="amo-compose-bar">
      <div class="amo-compose-type-wrap">
        <button type="button" class="amo-compose-type-btn" id="amo-compose-type-btn" aria-haspopup="true">Примечание ▾</button>
        <div class="amo-compose-type-menu" id="amo-compose-type-menu" hidden>
          <button type="button" data-mode="note" class="active">✓ Примечание</button>
          <button type="button" data-mode="task">Задача</button>
        </div>
      </div>
      <div class="amo-compose-note" id="amo-compose-note">
        <div class="amo-compose-input-row">
          <textarea id="feed-comment" class="amo-compose-input amo-compose-textarea" rows="1" placeholder="Текст примечания…"></textarea>
          <label class="btn btn-sm amo-compose-attach" title="Прикрепить файл">
            <span class="amo-compose-attach-icon" aria-hidden="true">📎</span>
            <input type="file" id="feed-attach" hidden>
          </label>
          <button type="button" class="btn btn-sm btn-primary amo-compose-send" id="feed-send">Добавить</button>
        </div>
        <div class="amo-compose-attach-preview muted small" id="feed-attach-preview" hidden></div>
      </div>
      <div class="amo-compose-task" id="amo-compose-task" hidden>
        <div class="amo-task-inline amo-task-compose-row">
          <span>Задача на</span>
          <div class="amo-task-due-wrap">
            <button type="button" class="amo-task-chip" id="task-due-chip">${escapeHtml(defaultDue.label)} ▾</button>
            <div class="amo-task-due-menu" id="task-due-menu" hidden>
              ${AMO_TASK_DUE_PRESETS.map(p =>
                `<button type="button" data-preset="${p.id}" data-label="${escapeHtml(p.label)}"${p.id === defaultDue.id ? ' class="active"' : ""}>${escapeHtml(p.label)}</button>`
              ).join("")}
              <button type="button" data-preset="custom" data-label="Выбрать дату">Выбрать дату и время</button>
            </div>
            <input type="datetime-local" id="task-due-custom" class="amo-task-due-custom" hidden>
          </div>
          <span>для</span>
          ${renderAmoTaskAssigneeInline()}
          <span class="amo-task-kind">Связаться:</span>
          <input type="text" id="task-title" class="amo-task-inline-input" placeholder="" autocomplete="off">
          <button type="button" class="btn btn-sm btn-primary" id="task-add">Поставить</button>
          <button type="button" class="btn btn-sm amo-link-btn" id="task-cancel">Отменить</button>
        </div>
        <input type="hidden" id="task-due-preset" value="${defaultDue.id}">
        <input type="hidden" id="task-due" value="${computeTaskDueFromPreset(defaultDue.id)}">
      </div>
    </div>`;
}

function setAmoComposeMode(mode) {
  const note = document.getElementById("amo-compose-note");
  const task = document.getElementById("amo-compose-task");
  const btn = document.getElementById("amo-compose-type-btn");
  const menu = document.getElementById("amo-compose-type-menu");
  if (!note || !task || !btn) return;
  const isTask = mode === "task";
  note.hidden = isTask;
  task.hidden = !isTask;
  btn.textContent = isTask ? "Задача ▾" : "Примечание ▾";
  menu?.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  if (menu) menu.hidden = true;
  if (isTask) document.getElementById("task-title")?.focus();
  else document.getElementById("feed-comment")?.focus();
}

function onComposeOutsideClick(e) {
  if (e.target.closest("#amo-compose-bar")) return;
  document.getElementById("amo-compose-type-menu")?.setAttribute("hidden", "");
  document.getElementById("task-due-menu")?.setAttribute("hidden", "");
}

function bindDealActivityComposeEvents(dealId, onRefresh, opts = {}) {
  const presaleMode = opts.mode === "presale";
  const typeBtn = document.getElementById("amo-compose-type-btn");
  const typeMenu = document.getElementById("amo-compose-type-menu");
  typeBtn?.addEventListener("click", e => {
    e.stopPropagation();
    if (typeMenu) typeMenu.hidden = !typeMenu.hidden;
    document.getElementById("task-due-menu")?.setAttribute("hidden", "");
  });
  typeMenu?.querySelectorAll("button[data-mode]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      setAmoComposeMode(btn.dataset.mode);
    });
  });
  if (!window._amoComposeOutsideBound) {
    document.addEventListener("click", onComposeOutsideClick);
    window._amoComposeOutsideBound = true;
  }

  const dueChip = document.getElementById("task-due-chip");
  const dueMenu = document.getElementById("task-due-menu");
  dueChip?.addEventListener("click", e => {
    e.stopPropagation();
    if (dueMenu) dueMenu.hidden = !dueMenu.hidden;
  });
  dueMenu?.querySelectorAll("button[data-preset]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const preset = btn.dataset.preset;
      const label = btn.dataset.label;
      const customInp = document.getElementById("task-due-custom");
      if (preset === "custom") {
        dueMenu.hidden = true;
        if (customInp) {
          customInp.hidden = false;
          customInp.removeAttribute("hidden");
          if (!customInp.value) {
            customInp.value = typeof toDatetimeLocalMsk === "function"
              ? toDatetimeLocalMsk(typeof addMskDays === "function" ? addMskDays(1, 18) : "")
              : "";
            if (!customInp.value && typeof addMskDays === "function") {
              customInp.value = toDatetimeLocalMsk(addMskDays(1, 18));
            }
          }
          if (typeof wireDatetimeInput === "function") wireDatetimeInput(customInp);
          if (typeof openDatetimePicker === "function") openDatetimePicker(customInp);
          else customInp.focus();
        }
        return;
      }
      document.getElementById("task-due-preset").value = preset;
      document.getElementById("task-due").value = computeTaskDueFromPreset(preset);
      if (dueChip) dueChip.textContent = `${label} ▾`;
      if (customInp) customInp.hidden = true;
      dueMenu.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      dueMenu.hidden = true;
    });
  });
  const customDueInp = document.getElementById("task-due-custom");
  if (customDueInp && typeof wireDatetimeInput === "function") wireDatetimeInput(customDueInp);
  customDueInp?.addEventListener("change", e => {
    const v = e.target.value;
    if (!v) return;
    const dueAt = typeof fromDatetimeLocalMsk === "function" ? fromDatetimeLocalMsk(v) : (v.length === 16 ? `${v.replace("T", " ")}:00` : v);
    document.getElementById("task-due-preset").value = "custom";
    document.getElementById("task-due").value = dueAt;
    if (dueChip) {
      dueChip.textContent = `${v.replace("T", " ")} ▾`;
    }
  });

  document.getElementById("feed-attach")?.addEventListener("change", e => {
    const f = e.target.files?.[0];
    const preview = document.getElementById("feed-attach-preview");
    if (!preview) return;
    if (!f) {
      preview.hidden = true;
      preview.textContent = "";
      return;
    }
    preview.hidden = false;
    preview.textContent = `Файл: ${f.name}`;
  });

  document.getElementById("feed-send")?.addEventListener("click", async () => {
    const body = document.getElementById("feed-comment")?.value?.trim();
    const fileInput = document.getElementById("feed-attach");
    const file = fileInput?.files?.[0] || null;
    if (!body && !file) return;
    try {
      if (presaleMode && typeof apiPostPresaleActivity === "function" && !file) {
        await apiPostPresaleActivity(dealId, { body });
      } else {
        await apiPostComment(dealId, body || "", file);
      }
      delete dealCrmCache[dealId];
      document.getElementById("feed-comment").value = "";
      if (fileInput) fileInput.value = "";
      const preview = document.getElementById("feed-attach-preview");
      if (preview) { preview.hidden = true; preview.textContent = ""; }
      if (onRefresh) await onRefresh();
      else if (typeof switchDealTab === "function") await switchDealTab("events");
      showToast(presaleMode ? "Запись пре-сейла добавлена" : (file ? "Комментарий и файл добавлены" : "Комментарий добавлен"));
    } catch (err) {
      showToast(err.message || "Не удалось добавить комментарий");
    }
  });
  const feedComment = document.getElementById("feed-comment");
  feedComment?.addEventListener("input", () => {
    if (typeof autoGrowTextarea === "function") autoGrowTextarea(feedComment);
  });
  if (feedComment && typeof autoGrowTextarea === "function") autoGrowTextarea(feedComment);
  document.getElementById("feed-comment")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("feed-send")?.click();
    }
  });

  document.getElementById("task-add")?.addEventListener("click", async () => {
    const title = document.getElementById("task-title")?.value?.trim();
    if (!title) return;
    const dueAt = document.getElementById("task-due")?.value || computeTaskDueFromPreset("tomorrow");
    await apiSaveTask(dealId, {
      title, dueAt,
      assignee: resolveClientTaskAssignee(document.getElementById("task-assignee")?.value || ""),
      status: "open",
    });
    delete dealCrmCache[dealId];
    document.getElementById("task-title").value = "";
    if (onRefresh) await onRefresh();
    else await switchDealTab("events");
    showToast("Задача добавлена");
  });
  document.getElementById("task-title")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("task-add")?.click();
    }
  });
  document.getElementById("task-cancel")?.addEventListener("click", () => {
    document.getElementById("task-title").value = "";
    setAmoComposeMode("note");
  });
}

function bindDealActivityEvents(dealId, onRefresh, opts = {}) {
  const allowDueReschedule = opts.mode !== "presale";
  const refresh = async () => {
    delete dealCrmCache[dealId];
    if (typeof loadDealNextTaskDue === "function") await loadDealNextTaskDue();
    if (onRefresh) await onRefresh();
    else await switchDealTab("events");
  };

  document.querySelectorAll(".amo-feed-file").forEach(btn => {
    btn.addEventListener("click", () => {
      const fileId = btn.dataset.fileId;
      const name = btn.querySelector(".amo-feed-file-name")?.textContent || "file";
      if (fileId && typeof apiDownloadDealFile === "function") {
        apiDownloadDealFile(dealId, fileId, name).catch(e => alert(e.message || String(e)));
      }
    });
  });

  document.querySelectorAll(".amo-task-done").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".amo-task-card");
      const row = card?.querySelector(".amo-task-result-row");
      if (!row) return;
      row.hidden = false;
      row.querySelector(".amo-task-result-input")?.focus();
      btn.hidden = true;
    });
  });

  document.querySelectorAll(".amo-task-result-save").forEach(btn => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".amo-task-card");
      const id = card?.dataset.id;
      if (!id) return;
      const result = card.querySelector(".amo-task-result-input")?.value?.trim();
      if (!result) {
        alert("Введите результат");
        return;
      }
      const crm = dealCrmCache[dealId] || {};
      const t = (crm.tasks || []).find(x => x.id === id);
      if (!t) return;
      await apiSaveTask(dealId, {
        ...t,
        status: "done",
        doneAt: new Date().toISOString(),
        result,
      });
      await refresh();
      showToast("Задача выполнена");
    });
  });

  document.querySelectorAll(".amo-task-result-input").forEach(inp => {
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        inp.closest(".amo-task-result-row")?.querySelector(".amo-task-result-save")?.click();
      }
    });
  });

  if (allowDueReschedule) document.querySelectorAll(".amo-task-due-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const card = btn.closest(".amo-task-card");
      const row = card?.querySelector(".amo-task-reschedule-row");
      const inp = row?.querySelector(".amo-task-due-input");
      if (!row || !inp) return;
      const opening = row.hidden;
      document.querySelectorAll(".amo-task-reschedule-row").forEach(r => { r.hidden = true; });
      row.hidden = !opening;
      if (row.hidden) return;
      inp.value = btn.dataset.due || inp.value || "";
      if (typeof wireDatetimeInput === "function") wireDatetimeInput(inp);
      if (typeof openDatetimePicker === "function") openDatetimePicker(inp);
      row.querySelector(".amo-task-reschedule-comment")?.focus();
    });
  });

  if (allowDueReschedule) document.querySelectorAll(".amo-task-reschedule-cancel").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const row = btn.closest(".amo-task-reschedule-row");
      if (row) row.hidden = true;
    });
  });

  if (allowDueReschedule) document.querySelectorAll(".amo-task-reschedule-save").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const card = btn.closest(".amo-task-card");
      const row = btn.closest(".amo-task-reschedule-row");
      const inp = row?.querySelector(".amo-task-due-input");
      const id = card?.dataset.id;
      if (!id || !inp) return;
      const crm = dealCrmCache[dealId] || {};
      const t = (crm.tasks || []).find(x => x.id === id);
      if (!t) return;
      let dueAt = inp.value;
      if (dueAt) {
        dueAt = typeof fromDatetimeLocalMsk === "function"
          ? fromDatetimeLocalMsk(dueAt)
          : (dueAt.length === 16 ? `${dueAt.replace("T", " ")}:00` : dueAt);
      }
      const prevDue = typeof toDatetimeLocalMsk === "function" ? toDatetimeLocalMsk(t.dueAt) : (t.dueAt || "").slice(0, 16);
      if (!dueAt || inp.value === prevDue) {
        row.hidden = true;
        return;
      }
      const comment = row.querySelector(".amo-task-reschedule-comment")?.value?.trim();
      if (!comment) {
        alert("Укажите причину переноса");
        row.querySelector(".amo-task-reschedule-comment")?.focus();
        return;
      }
      try {
        await apiSaveTask(dealId, { ...t, dueAt, rescheduleComment: comment });
        await refresh();
        showToast("Срок задачи изменён");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  });

  if (allowDueReschedule) {
    document.querySelectorAll(".amo-task-due-input").forEach(inp => {
      if (typeof wireDatetimeInput === "function") wireDatetimeInput(inp);
    });
    document.querySelectorAll(".amo-task-reschedule-comment").forEach(inp => {
      inp.addEventListener("keydown", ev => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        inp.closest(".amo-task-reschedule-row")?.querySelector(".amo-task-reschedule-save")?.click();
      });
    });
  }

  document.querySelectorAll(".task-done-cb").forEach(cb => {
    cb.onchange = async () => {
      const row = cb.closest(".task-row");
      const id = row?.dataset.id;
      if (!id) return;
      const crm = dealCrmCache[dealId] || {};
      const t = (crm.tasks || []).find(x => x.id === id);
      if (!t) return;
      await apiSaveTask(dealId, { ...t, status: cb.checked ? "done" : "open", doneAt: cb.checked ? new Date().toISOString() : null });
      await refresh();
      showToast(cb.checked ? "Задача выполнена" : "Задача открыта");
    };
  });

  document.querySelectorAll(".task-del").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Удалить задачу?")) return;
      const id = btn.closest(".amo-task-card, .task-row")?.dataset.id;
      await apiDeleteTask(dealId, id);
      await refresh();
    };
  });
}

function renderEventsTab(dealId, crm) {
  return `
    <div class="events-layout amo-events-modal">
      ${renderDealActivityPanel(dealId, crm)}
      ${renderDealActivityCompose(dealTabCanEdit())}
      <div class="form-section-title" style="margin-top:1rem">Прикрепить файл</div>
      ${dealTabCanEdit() ? `<div class="file-form">
        <select id="event-file-label"><option>ТЗ</option><option>КП</option><option>Договор</option><option>Прочее</option></select>
        <input type="file" id="event-file-input">
        <button type="button" class="btn btn-primary btn-sm" id="event-file-upload">Загрузить</button>
      </div>` : ""}
    </div>`;
}

function fileCategoryLabel(label) {
  const s = String(label || "").trim();
  if (!s || /^Amo(File)?:\d+/i.test(s) || /^Amo:/i.test(s)) return "";
  const cats = ["ТЗ", "КП", "Договор", "Прочее", "Файл"];
  return cats.includes(s) ? s : (s.startsWith("Amo") ? "" : s);
}

function fileDisplayName(f) {
  const name = String(f.originalName || "").trim();
  if (name) return name;
  const cat = fileCategoryLabel(f.label);
  return cat || "Файл";
}

function formatFileSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIconKind(name) {
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  if (["doc", "docx", "rtf"].includes(ext)) return "doc";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "img";
  if (["zip", "rar", "7z"].includes(ext)) return "archive";
  return "file";
}

function fileIconSvg(kind) {
  const docPath = "M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z";
  const path = kind === "img"
    ? "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-3-3 2-4-4-5 5V5z"
    : docPath;
  return `<svg class="deal-file-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="currentColor"/></svg>`;
}

function formatFileUploadDate(iso) {
  if (!iso) return "";
  if (typeof formatRuDate === "function") return formatRuDate(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function renderFilesTab(dealId, crm) {
  const canEdit = dealTabCanEdit();
  const rows = (crm.files || []).map(f => {
    const name = fileDisplayName(f);
    const cat = fileCategoryLabel(f.label);
    const kind = fileIconKind(name);
    const dateLabel = formatFileUploadDate(f.uploadedAt);
    const meta = [dateLabel, cat, formatFileSize(f.size)].filter(Boolean).join(" · ");
    return `
    <div class="deal-file-row">
      <div class="deal-file-icon deal-file-icon--${kind}">${fileIconSvg(kind)}</div>
      <div class="deal-file-body">
        <button type="button" class="deal-file-download" data-id="${escapeHtml(f.id)}" data-name="${escapeHtml(name)}" data-mime="${escapeHtml(f.mimeType || "")}" title="Скачать">${escapeHtml(name)}</button>
        ${meta ? `<div class="deal-file-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      ${canEdit ? `<button type="button" class="deal-file-del" data-id="${f.id}" title="Удалить" aria-label="Удалить">✕</button>` : ""}
    </div>`;
  }).join("");
  return `
    <div class="deal-file-list">${rows || "<p class='muted deal-file-empty'>Нет файлов</p>"}</div>
    ${canEdit ? `<div class="file-form">
      <select id="file-label"><option>ТЗ</option><option>КП</option><option>Договор</option><option>Прочее</option></select>
      <input type="file" id="file-input">
      <button type="button" class="btn btn-primary btn-sm" id="file-upload">Загрузить</button>
    </div>` : ""}`;
}

function contactInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || "").join("") || "?";
}

function renderContactsTab(dealId, crm) {
  const contacts = crm.contacts?.length ? crm.contacts : [{ name: "", email: "", phone: "", role: "" }];
  const canEdit = dealTabCanEdit();
  const rows = contacts.map((c, i) => `
    <div class="amo-contact-card" data-i="${i}">
      <div class="amo-contact-head">
        <div class="amo-contact-avatar">${escapeHtml(contactInitials(c.name))}</div>
        <div class="amo-contact-name-wrap">
          <input class="amo-contact-name" value="${escapeHtml(c.name)}" placeholder="ФИО контакта" ${canEdit ? "" : "disabled"}>
          ${canEdit ? `<button type="button" class="amo-contact-remove" data-i="${i}" title="Удалить">✕</button>` : ""}
        </div>
      </div>
      <div class="amo-contact-fields">
        <div class="amo-contact-field">
          <span class="amo-contact-label">Email</span>
          <input class="amo-contact-email" value="${escapeHtml(c.email)}" placeholder="email@company.ru" ${canEdit ? "" : "disabled"}>
        </div>
        <div class="amo-contact-field">
          <span class="amo-contact-label">Телефон</span>
          <input class="amo-contact-phone" value="${escapeHtml(c.phone)}" placeholder="+7 …" ${canEdit ? "" : "disabled"}>
        </div>
        <div class="amo-contact-field">
          <span class="amo-contact-label">Должность</span>
          <input class="amo-contact-role" value="${escapeHtml(c.role)}" placeholder="Должность" ${canEdit ? "" : "disabled"}>
        </div>
      </div>
    </div>`).join("");
  return `
    <div class="amo-contacts-list" id="contacts-wrap">${rows}</div>
    ${canEdit ? `<button type="button" class="amo-contact-add" id="contact-add"><span class="amo-contact-add-icon">+</span> Добавить контакт</button>
    <button type="button" class="btn btn-primary btn-sm" id="contacts-save">Сохранить контакты</button>` : ""}`;
}

function renderInfoTab(dealId, crm) {
  const i = crm.info || {};
  const canEdit = dealTabCanEdit();
  const dis = canEdit ? "" : "disabled";
  const dt = v => v ? (typeof formatRuDate === "function" ? formatRuDate(v) : String(v).slice(0, 10)) : "";
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
        <div><label>Дата привлечения</label><input type="date" id="info-lead-date" value="${dt(i.leadDate)}" ${dis}></div>
        <div><label>utm_source</label><input id="info-utm-source" value="${escapeHtml(i.utmSource)}" ${dis}></div>
        <div><label>utm_medium</label><input id="info-utm-medium" value="${escapeHtml(i.utmMedium)}" ${dis}></div>
        <div><label>utm_campaign</label><input id="info-utm-campaign" value="${escapeHtml(i.utmCampaign)}" ${dis}></div>
        <div><label>Лендинг</label><input id="info-landing" value="${escapeHtml(i.landingPage)}" ${dis}></div>
        <div><label>Referrer</label><input id="info-referrer" value="${escapeHtml(i.referrer)}" ${dis}></div>
      </div>
    </div>
    <div class="form-section"><div class="form-section-title">Данные</div>
      <div class="form-grid">
        <div><label>Продукт ИТМен</label><input id="info-product-itmen" value="${escapeHtml(i.productItmen)}" ${dis}></div>
        <div><label>Конечные точки</label><input id="info-endpoints" value="${escapeHtml(i.endpoints)}" ${dis}></div>
        <div><label>Формат закупки</label><input id="info-procurement-format" value="${escapeHtml(i.procurementFormat)}" ${dis}></div>
        <div><label>Регистрация до даты</label><input type="date" id="info-registration-deadline" value="${dt(i.registrationDeadline)}" ${dis}></div>
        <div><label>Общий размер инфраструктуры</label><input id="info-infrastructure-size" value="${escapeHtml(i.infrastructureSize)}" ${dis}></div>
        <div><label>Соответствие функционалу</label><input id="info-functional-fit" value="${escapeHtml(i.functionalFit)}" ${dis}></div>
        <div><label>Старт теста</label><input type="date" id="info-test-start" value="${dt(i.testStart)}" ${dis}></div>
        <div><label>Окончание теста</label><input type="date" id="info-test-end" value="${dt(i.testEnd)}" ${dis}></div>
        <div><label>Дистрибьютор</label>${typeof renderPartnerPickerHtml === "function"
          ? renderPartnerPickerHtml("info-distributor", i.distributor || "Нет дистрибьютора", { emptyLabel: "Нет дистрибьютора", disabled: !canEdit })
          : `<input id="info-distributor" value="${escapeHtml(i.distributor)}" ${dis}>`}</div>
        <div><label>Планируемая дата оплаты</label><input type="date" id="info-planned-payment-date" value="${dt(i.plannedPaymentDate)}" ${dis}></div>
        <div><label>Дата отгрузки</label><input type="date" id="info-shipment-date" value="${dt(i.shipmentDate)}" ${dis}></div>
        <div><label>ABM Tier</label><input id="info-abm-tier" value="${escapeHtml(i.abmTier)}" ${dis}></div>
      </div>
    </div>
    ${canEdit ? `<button type="button" class="btn btn-primary btn-sm" id="info-save">Сохранить</button>` : ""}`;
}

function collectContactsFromDom() {
  return [...document.querySelectorAll("#contacts-wrap .amo-contact-card")].map(row => ({
    name: row.querySelector(".amo-contact-name")?.value || "",
    email: row.querySelector(".amo-contact-email")?.value || "",
    phone: row.querySelector(".amo-contact-phone")?.value || "",
    role: row.querySelector(".amo-contact-role")?.value || "",
  })).filter(c => c.name || c.email || c.phone);
}

function collectInfoFromDom() {
  const val = id => document.getElementById(id)?.value || "";
  return {
    companyName: val("info-company"),
    companyInn: val("info-inn"),
    companyKpp: val("info-kpp"),
    companyOgrn: val("info-ogrn"),
    website: val("info-website"),
    sourceChannel: val("info-channel"),
    leadDate: val("info-lead-date") || null,
    utmSource: val("info-utm-source"),
    utmMedium: val("info-utm-medium"),
    utmCampaign: val("info-utm-campaign"),
    landingPage: val("info-landing"),
    referrer: val("info-referrer"),
    productItmen: val("info-product-itmen"),
    endpoints: val("info-endpoints"),
    procurementFormat: val("info-procurement-format"),
    registrationDeadline: val("info-registration-deadline") || null,
    infrastructureSize: val("info-infrastructure-size"),
    grade: val("info-grade"),
    closingTool: val("info-closing-tool"),
    functionalFit: val("info-functional-fit"),
    testStart: val("info-test-start") || null,
    testEnd: val("info-test-end") || null,
    distributor: typeof getPartnerRefValue === "function" ? getPartnerRefValue("info-distributor") : val("info-distributor"),
    activityKind: val("info-activity-kind"),
    testOs: val("info-test-os"),
    plannedPaymentDate: val("info-planned-payment-date") || null,
    shipmentDate: val("info-shipment-date") || null,
    projectMapUrl: val("info-project-map-url"),
    abmTier: val("info-abm-tier"),
    contractTerm: val("info-contract-term"),
  };
}

function bindContactRemoveButtons() {
  document.querySelectorAll(".amo-contact-remove").forEach(btn => {
    btn.onclick = () => btn.closest(".amo-contact-card")?.remove();
  });
}

function bindDealCrmTabEvents(dealId, tab, onRefresh) {
  if (tab === "events") {
    bindDealActivityComposeEvents(dealId, onRefresh);
    bindDealActivityEvents(dealId, onRefresh);
    document.getElementById("event-file-upload")?.addEventListener("click", async () => {
      const f = document.getElementById("event-file-input")?.files?.[0];
      if (!f) return alert("Выберите файл");
      await apiUploadDealFile(dealId, f, document.getElementById("event-file-label")?.value);
      delete dealCrmCache[dealId];
      if (onRefresh) await onRefresh();
      else await switchDealTab("events");
      showToast("Файл загружен — см. вкладку «Файлы»");
    });
    return;
  }
  if (tab === "files") {
    document.getElementById("file-upload")?.addEventListener("click", async () => {
      const f = document.getElementById("file-input")?.files?.[0];
      if (!f) return alert("Выберите файл");
      await apiUploadDealFile(dealId, f, document.getElementById("file-label")?.value);
      delete dealCrmCache[dealId];
      if (onRefresh) await onRefresh();
      else await switchDealTab("files");
      showToast("Файл загружен");
    });
    document.querySelectorAll(".deal-file-download").forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await apiDownloadDealFile(dealId, btn.dataset.id, btn.dataset.name, btn.dataset.mime);
        } catch (e) {
          alert(e.message || "Не удалось скачать файл");
        } finally {
          btn.disabled = false;
        }
      };
    });
    document.querySelectorAll(".deal-file-del").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Удалить файл?")) return;
        await apiDeleteDealFile(dealId, btn.dataset.id);
        delete dealCrmCache[dealId];
        if (onRefresh) await onRefresh();
        else await switchDealTab("files");
      };
    });
  }
  if (tab === "contacts") {
    const contactAdd = document.getElementById("contact-add");
    if (contactAdd) contactAdd.onclick = () => {
      document.getElementById("contacts-wrap")?.insertAdjacentHTML("beforeend",
        `<div class="amo-contact-card"><div class="amo-contact-head"><div class="amo-contact-avatar">?</div><div class="amo-contact-name-wrap"><input class="amo-contact-name" placeholder="ФИО контакта"><button type="button" class="amo-contact-remove" title="Удалить">✕</button></div></div><div class="amo-contact-fields"><div class="amo-contact-field"><span class="amo-contact-label">Email</span><input class="amo-contact-email" placeholder="email@company.ru"></div><div class="amo-contact-field"><span class="amo-contact-label">Телефон</span><input class="amo-contact-phone" placeholder="+7 …"></div><div class="amo-contact-field"><span class="amo-contact-label">Должность</span><input class="amo-contact-role" placeholder="Должность"></div></div></div>`);
      bindContactRemoveButtons();
    };
    bindContactRemoveButtons();
    const contactsSave = document.getElementById("contacts-save");
    if (contactsSave) contactsSave.onclick = async () => {
      await apiSaveContacts(dealId, collectContactsFromDom());
      delete dealCrmCache[dealId];
      showToast("Контакты сохранены");
      if (typeof refreshDealPageRightPanel === "function") await refreshDealPageRightPanel();
    };
  }
  if (tab === "info") {
    const infoSave = document.getElementById("info-save");
    if (infoSave) infoSave.onclick = async () => {
      const prevInfo = dealCrmCache[dealId]?.info || {};
      await apiSaveDealInfo(dealId, { ...prevInfo, ...collectInfoFromDom() });
      delete dealCrmCache[dealId];
      showToast("Информация сохранена");
      if (typeof refreshDealPageRightPanel === "function") await refreshDealPageRightPanel();
    };
  }
}

function invalidateDealCrmCache(dealId) {
  if (dealId) delete dealCrmCache[dealId];
  else dealCrmCache = {};
}

document.addEventListener("DOMContentLoaded", () => initDealModalTabs());
if (document.readyState !== "loading") initDealModalTabs();

window.renderDealModalTabs = renderDealModalTabs;
window.initDealModalTabs = initDealModalTabs;
window.switchDealTab = switchDealTab;
window.setDealModalDealId = setDealModalDealId;
window.getDealModalDealId = getDealModalDealId;
window.storeDealPassportHtml = storeDealPassportHtml;
window.invalidateDealCrmCache = invalidateDealCrmCache;
window.dealModalTab = () => dealModalTab;
window.renderDealActivityPanel = renderDealActivityPanel;
window.renderDealActivityTimeline = renderDealActivityTimeline;
window.mergePresaleActivitiesIntoCrm = mergePresaleActivitiesIntoCrm;
window.filterCrmForFeedAudience = filterCrmForFeedAudience;
window.renderDealOpenTasksPin = renderDealOpenTasksPin;
window.renderDealActivityCompose = renderDealActivityCompose;
window.bindDealActivityEvents = bindDealActivityEvents;
window.bindDealActivityComposeEvents = bindDealActivityComposeEvents;
