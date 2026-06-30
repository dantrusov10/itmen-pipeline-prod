/* Техническое исследование — 5 блоков */

const OTHER_SEGMENT_ID = "other";

function defaultTechResearch() {
  return {
    seekingSegments: [],
    seekingOtherLabel: "",
    asIsStack: {},
    changePains: {},
    competitorEntries: {},
    projectTasks: [],
    productRequirementsPct: null,
    pilotRequirementsPct: null,
  };
}

function getOtherSegmentLabel(tr) {
  const fromDom = document.getElementById("seek-other-label")?.value?.trim();
  if (fromDom) return fromDom;
  return tr?.seekingOtherLabel?.trim() || "Другое";
}

function getSegmentDef(segId, tr) {
  if (segId === OTHER_SEGMENT_ID) {
    return { id: OTHER_SEGMENT_ID, label: getOtherSegmentLabel(tr), className: null };
  }
  return (window.ITMEN_CONFIG?.techSegments || []).find(s => s.id === segId);
}

const VENDOR_PRESET_OPTIONS = [
  { key: "__preset__|||not_implemented", vendor: "Не было реализовано", product: "—", label: "Не было реализовано", preset: true },
  { key: "__preset__|||excel", vendor: "Excel", product: "—", label: "Excel", preset: true },
];

function getVendorPresetOptions() {
  return VENDOR_PRESET_OPTIONS;
}

function findCatalogItem(key) {
  if (!key) return null;
  const preset = VENDOR_PRESET_OPTIONS.find(x => x.key === key);
  if (preset) return preset;
  return getGlobalCatalog().find(x => x.key === key);
}

function getGlobalCatalog() {
  const arch = window.ITMEN_ARCHITECTURE;
  if (!arch) return [];
  if (window._itmenCatalogCache) return window._itmenCatalogCache;
  if (arch.globalCatalog?.length) {
    window._itmenCatalogCache = arch.globalCatalog;
    return window._itmenCatalogCache;
  }
  const map = {};
  (arch.zones || []).forEach(z => (z.classes || []).forEach(cls => (cls.catalog || []).forEach(v => {
    const key = `${v.vendor}|||${v.product}`;
    if (!map[key]) map[key] = { ...v, key, label: `${v.vendor} — ${v.product}`, classes: [] };
    if (!map[key].classes.includes(cls.name)) map[key].classes.push(cls.name);
  })));
  window._itmenCatalogCache = Object.values(map).sort((a, b) => a.label.localeCompare(b.label, "ru"));
  return window._itmenCatalogCache;
}

function catalogCountLabel() {
  if (window.ITMEN_ARCHITECTURE?.catalogCount) return window.ITMEN_ARCHITECTURE.catalogCount;
  const n = getGlobalCatalog().length;
  return n || "—";
}

function getCatalogForSegment(segId) {
  const seg = getSegmentDef(segId);
  if (!seg) return getGlobalCatalog();
  const segClass = seg.className;
  const all = getGlobalCatalog();
  const preferred = all.filter(x => (x.classes || []).includes(segClass));
  const rest = all.filter(x => !(x.classes || []).includes(segClass));
  return [...preferred, ...rest];
}

function searchVendorCatalog(query, segId, limit = 50) {
  const ql = (query || "").trim().toLowerCase();
  const presets = getVendorPresetOptions();
  const presetMatches = ql
    ? presets.filter(x =>
      x.label.toLowerCase().includes(ql) ||
      x.vendor.toLowerCase().includes(ql) ||
      x.product.toLowerCase().includes(ql)
    )
    : presets;
  const presetKeys = new Set(presetMatches.map(x => x.key));
  let list = getCatalogForSegment(segId).filter(x => !presetKeys.has(x.key));
  const catalogMatches = ql
    ? list.filter(x =>
      x.label.toLowerCase().includes(ql) ||
      x.vendor.toLowerCase().includes(ql) ||
      x.product.toLowerCase().includes(ql)
    )
    : list;
  const restLimit = Math.max(0, limit - presetMatches.length);
  return [...presetMatches, ...catalogMatches.slice(0, restLimit)];
}

function migrateReviewedProducts(tr) {
  if (!tr.reviewedProducts?.length) return;
  if (tr.competitorEntries && Object.values(tr.competitorEntries).some(a => a?.length)) return;
  const statusMap = { evaluating: "evaluating", shortlist: "evaluating", rejected: "rejected", selected: "selected" };
  const entries = tr.reviewedProducts.map(p => ({
    vendor: String(p.name || "").split("—")[0]?.trim() || String(p.name || "").trim(),
    product: String(p.name || "").split("—")[1]?.trim() || "",
    catalogKey: "",
    status: statusMap[p.status] || "evaluating",
    rejectReason: (p.rejectedReasons || []).join("; "),
    continueReason: (p.appealReasons || []).join("; "),
    comment: p.comment || "",
  })).filter(e => e.vendor || e.product || e.comment);
  if (entries.length) {
    const seg = tr.seekingSegments?.[0] || "_general";
    tr.competitorEntries = { [seg]: entries };
  }
}

function migrateTechResearch(tr) {
  tr = tr || defaultTechResearch();
  if (tr.classEntries && !tr.seekingSegments?.length) {
    tr = { ...defaultTechResearch(), ...tr, classEntries: tr.classEntries };
  }
  if (!tr.seekingSegments) tr.seekingSegments = [];
  if (tr.seekingOtherLabel == null) tr.seekingOtherLabel = "";
  if (!tr.asIsStack) tr.asIsStack = {};
  if (!tr.changePains) tr.changePains = {};
  if (!tr.competitorEntries) tr.competitorEntries = {};
  if (!tr.projectTasks) tr.projectTasks = [];

  migrateReviewedProducts(tr);

  if (tr.searchGoals?.length) {
    const map = { discovery: "discovery", itsm: "itsm", asset: "itam", monitoring: "monitoring", cmdb: "cmdb" };
    tr.searchGoals.forEach(g => { if (map[g] && !tr.seekingSegments.includes(map[g])) tr.seekingSegments.push(map[g]); });
  }

  const taskLabels = Object.fromEntries((window.ITMEN_CONFIG?.projectTasks || []).map(t => [t.id, t.label]));
  tr.projectTasks = (tr.projectTasks || []).map(t => {
    if (typeof t !== "string") return String(t || "").trim();
    return taskLabels[t] || t;
  }).filter(Boolean);

  if (tr.projectTasksCustom) {
    tr.projectTasks.push(...String(tr.projectTasksCustom).split(/[\n;]/).map(s => s.trim()).filter(Boolean));
  }

  if (tr.projectCompliancePct != null && tr.productRequirementsPct == null) tr.productRequirementsPct = tr.projectCompliancePct;
  if (tr.pilotCompliancePct != null && tr.pilotRequirementsPct == null) tr.pilotRequirementsPct = tr.pilotCompliancePct;

  delete tr.classEntries;
  delete tr.searchGoals;
  delete tr.currentSolutions;
  delete tr.reviewedProducts;
  delete tr.projectCompliancePct;
  delete tr.pilotCompliancePct;
  delete tr.projectTasksCustom;

  ["_legacy", "_general"].forEach(key => {
    if (tr.competitorEntries[key]?.length && tr.seekingSegments?.length) {
      const first = tr.seekingSegments[0];
      tr.competitorEntries[first] = [...(tr.competitorEntries[first] || []), ...tr.competitorEntries[key]];
      delete tr.competitorEntries[key];
    }
  });

  return tr;
}

function renderCompetitorRow(segId, idx, entry) {
  entry = entry || {};
  const seg = getSegmentDef(segId);
  const statuses = window.ITMEN_CONFIG?.competitorStatuses || [];
  const st = entry.status || "evaluating";
  const showReject = st === "rejected" || st === "selected";
  const showContinue = st === "reviewed" || st === "evaluating" || st === "planned";
  return `<div class="comp-row" data-seg="${segId}" data-idx="${idx}">
    <div class="comp-row-head">
      <span class="comp-row-num">#${idx + 1}</span>
      <select class="comp-status" onchange="toggleCompReasonFields(this)">
        ${statuses.map(s => `<option value="${s.id}" ${st === s.id ? "selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}
      </select>
      <button type="button" class="btn btn-sm btn-danger" onclick="removeCompetitorRow(this)" title="Удалить">✕</button>
    </div>
    ${renderVendorPicker(segId, entry, { compact: true })}
    <div class="comp-reasons">
      <div class="comp-reject-wrap" style="display:${showReject ? "block" : "none"}">
        <label>Почему отказались</label>
        <textarea class="comp-reject auto-grow" rows="1" placeholder="Причины отказа от вендора">${escapeHtml(entry.rejectReason || "")}</textarea>
      </div>
      <div class="comp-continue-wrap" style="display:${showContinue ? "block" : "none"}">
        <label>Почему продолжают смотреть / что нравится</label>
        <textarea class="comp-continue auto-grow" rows="1" placeholder="Что привлекает, почему в short-list">${escapeHtml(entry.continueReason || "")}</textarea>
      </div>
      <div>
        <label>Комментарий</label>
        <textarea class="comp-comment auto-grow" rows="1" placeholder="Доп. контекст: демо, контакты, цена…">${escapeHtml(entry.comment || "")}</textarea>
      </div>
    </div>
  </div>`;
}

function renderSegmentCompetitorBlock(segId, entries, tr) {
  const seg = getSegmentDef(segId, tr);
  const label = segId === OTHER_SEGMENT_ID ? getOtherSegmentLabel(tr) : (seg?.label || segId);
  const list = entries?.length ? entries : [];
  const rows = list.length
    ? list.map((e, i) => renderCompetitorRow(segId, i, e)).join("")
    : `<div class="muted comp-empty">Нет записей — добавьте вендора из short-list клиента</div>`;
  return `<div class="comp-seg-block" data-seg="${segId}">
    <div class="seg-row-title">${escapeHtml(label)}</div>
    <div class="comp-rows">${rows}</div>
    <button type="button" class="btn btn-sm" onclick="addCompetitorRow('${segId}')">+ Добавить вендора</button>
  </div>`;
}

function updateOtherSegmentTitles() {
  const label = getOtherSegmentLabel();
  document.querySelectorAll(`.seg-pain-row[data-seg="${OTHER_SEGMENT_ID}"] label`).forEach(el => {
    el.textContent = `Боли / почему меняют — ${label}`;
  });
  document.querySelectorAll(`.comp-seg-block[data-seg="${OTHER_SEGMENT_ID}"] > .seg-row-title`).forEach(el => {
    el.textContent = label;
  });
}

function syncSeekOtherWrap() {
  const wrap = document.getElementById("seek-other-wrap");
  const cb = document.querySelector(`.seg-seek-cb[value="${OTHER_SEGMENT_ID}"]`);
  if (wrap) wrap.style.display = cb?.checked ? "block" : "none";
}

function toggleCompReasonFields(sel) {
  const row = sel.closest(".comp-row");
  if (!row) return;
  const st = sel.value;
  const rejectWrap = row.querySelector(".comp-reject-wrap");
  const continueWrap = row.querySelector(".comp-continue-wrap");
  if (rejectWrap) rejectWrap.style.display = (st === "rejected" || st === "selected") ? "block" : "none";
  if (continueWrap) continueWrap.style.display = (st === "reviewed" || st === "evaluating" || st === "planned") ? "block" : "none";
}

function addCompetitorRow(segId) {
  const block = document.querySelector(`.comp-seg-block[data-seg="${segId}"]`);
  if (!block) return;
  const rowsEl = block.querySelector(".comp-rows");
  const empty = block.querySelector(".comp-empty");
  if (empty) empty.remove();
  const idx = rowsEl.querySelectorAll(".comp-row").length;
  rowsEl.insertAdjacentHTML("beforeend", renderCompetitorRow(segId, idx, {}));
  if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(rowsEl);
}

function removeCompetitorRow(btn) {
  const row = btn.closest(".comp-row");
  const block = btn.closest(".comp-seg-block");
  if (!row || !block) return;
  row.remove();
  block.querySelectorAll(".comp-row").forEach((r, i) => {
    r.dataset.idx = i;
    const num = r.querySelector(".comp-row-num");
    if (num) num.textContent = "#" + (i + 1);
  });
  const rowsEl = block.querySelector(".comp-rows");
  if (!rowsEl.querySelector(".comp-row")) {
    rowsEl.innerHTML = `<div class="muted comp-empty">Нет записей — добавьте вендора из short-list клиента</div>`;
  }
}

function renderVendorPicker(segId, data, opts) {
  opts = opts || {};
  data = data || {};
  const display = data.vendor && data.product ? `${data.vendor} — ${data.product}` : "";
  return `<div class="vendor-picker" data-seg="${segId}">
    ${opts.compact ? "" : `<label class="picker-label">Поиск вендора / продукта <span class="muted">(${catalogCountLabel()} в каталоге)</span></label>`}
    <input type="text" class="vendor-search" autocomplete="off"
      placeholder="Поиск вендора / продукта…"
      value="${escapeHtml(display)}"
      oninput="onVendorSearch(this)" onfocus="onVendorSearch(this)" onblur="hideVendorDropdownDelayed(this)">
    <div class="vendor-dropdown"></div>
    <div class="grid-3" style="margin-top:.35rem">
      <div><input class="seg-vendor" placeholder="Вендор" value="${escapeHtml(data.vendor || "")}"></div>
      <div><input class="seg-product" placeholder="Продукт" value="${escapeHtml(data.product || "")}"></div>
      <div><button type="button" class="btn btn-sm" onclick="clearVendorPicker(this)">Очистить</button></div>
    </div>
    <input type="hidden" class="seg-catalog-key" value="${escapeHtml(data.catalogKey || "")}">
  </div>`;
}

function renderSegmentAsIsRow(segId, data, tr) {
  data = data || {};
  const seg = getSegmentDef(segId, tr);
  return `<div class="seg-row" data-seg="${segId}">
    <div class="seg-row-title">${segId === OTHER_SEGMENT_ID
      ? `Другое: <input type="text" class="seg-other-label" id="seek-other-label" placeholder="Укажите, что ищут" value="${escapeHtml(tr?.seekingOtherLabel || "")}" oninput="updateOtherSegmentTitles()">`
      : escapeHtml(seg?.label || segId)}</div>
    ${renderVendorPicker(segId, data)}
    <div style="margin-top:.35rem"><textarea class="seg-comment auto-grow" rows="1" placeholder="Как работает сейчас (кратко)">${escapeHtml(data.comment || "")}</textarea></div>
  </div>`;
}

function renderSegmentPainRow(segId, text, tr) {
  const seg = getSegmentDef(segId, tr);
  const label = segId === OTHER_SEGMENT_ID ? getOtherSegmentLabel(tr) : (seg?.label || segId);
  return `<div class="seg-pain-row" data-seg="${segId}">
    <label>Боли / почему меняют — ${escapeHtml(label)}</label>
    <textarea class="seg-pain auto-grow" rows="1" placeholder="Что не устраивает, триггер смены">${escapeHtml(text || "")}</textarea>
  </div>`;
}

function renderProjectTasksRows(tasks) {
  const list = tasks?.length ? tasks : [""];
  return `<div id="project-tasks-panel">${list.map(t =>
    `<div class="task-row">
      <textarea class="proj-task-input auto-grow" rows="1" placeholder="Задача проекта">${escapeHtml(t)}</textarea>
      <button type="button" class="btn btn-sm btn-danger task-remove" onclick="removeTaskRow(this)" title="Удалить">✕</button>
    </div>`
  ).join("")}</div>
  <button type="button" class="btn btn-sm" onclick="addTaskRow()">+ Добавить задачу</button>`;
}

function renderTechSection(tr, deal) {
  tr = migrateTechResearch(tr);
  const productPct = deal?.productFeasibilityPct ?? tr.productRequirementsPct;
  const pilotPct = deal?.pilotFeasibilityPct ?? tr.pilotRequirementsPct;
  const segments = window.ITMEN_CONFIG?.techSegments || [];
  const selected = new Set(tr.seekingSegments || []);

  const block1 = segments.map(s =>
    `<label class="checkbox-label"><input type="checkbox" class="seg-seek-cb" value="${s.id}" ${selected.has(s.id) ? "checked" : ""} onchange="syncTechSegmentPanels()"> ${escapeHtml(s.label)}</label>`
  ).join("") + `
    <label class="checkbox-label"><input type="checkbox" class="seg-seek-cb" value="${OTHER_SEGMENT_ID}" ${selected.has(OTHER_SEGMENT_ID) ? "checked" : ""} onchange="syncTechSegmentPanels()"> Другое</label>
    <div id="seek-other-wrap" class="seek-other-wrap" style="display:${selected.has(OTHER_SEGMENT_ID) ? "block" : "none"}">
      <input type="text" id="seek-other-label-top" class="seek-other-label-top" placeholder="Укажите, что ищут" value="${escapeHtml(tr.seekingOtherLabel || "")}" oninput="syncSeekOtherLabelToPanels()">
    </div>`;

  const activeSegs = tr.seekingSegments?.length ? tr.seekingSegments : [];
  const block2 = activeSegs.length
    ? activeSegs.map(id => renderSegmentAsIsRow(id, tr.asIsStack?.[id], tr)).join("")
    : `<div class="muted" id="asis-placeholder">Сначала выберите сегменты в блоке 1</div>`;

  const block3 = activeSegs.length
    ? activeSegs.map(id => renderSegmentPainRow(id, tr.changePains?.[id], tr)).join("")
    : `<div class="muted" id="pain-placeholder">Появится после выбора сегментов</div>`;

  const block4 = activeSegs.length
    ? activeSegs.map(id => renderSegmentCompetitorBlock(id, tr.competitorEntries?.[id], tr)).join("")
    : `<div class="muted" id="comp-placeholder">Появится после выбора сегментов</div>`;

  return `
    <div class="tech-block">
      <div class="tech-block-head">1. Что ищут</div>
      <div class="checkbox-group" id="seek-segments">${block1}</div>
    </div>
    <div class="tech-block">
      <div class="tech-block-head">2. Что есть сейчас / как работает</div>
      <div id="asis-panel">${block2}</div>
    </div>
    <div class="tech-block">
      <div class="tech-block-head">3. Почему меняют</div>
      <div id="pain-panel">${block3}</div>
    </div>
    <div class="tech-block">
      <div class="tech-block-head">4. Конкурентный анализ — кого смотрят / смотрели</div>
      <p class="muted" style="font-size:.75rem;margin-bottom:.5rem">По каждому сегменту: вендор из каталога, статус (смотрели / смотрят / планируют / отказ / выбрали), причины и комментарий.</p>
      <div id="comp-panel">${block4}</div>
    </div>
    <div class="tech-block">
      <div class="tech-block-head">5. Ключевые задачи от проекта</div>
      <p class="muted" style="font-size:.75rem;margin-bottom:.5rem">1 строка = 1 задача. Можно добавлять строки.</p>
      ${renderProjectTasksRows(tr.projectTasks)}
    </div>
    <div class="tech-block">
      <div class="tech-block-head">6. Соответствие требованиям (%)</div>
      <div class="form-grid">
        <div>
          <label>% требований проекта (продукт) ${hint(window.ITMEN_CONFIG?.fieldHints?.productReqPct || "")}</label>
          <input type="number" min="0" max="100" id="f-productReqPct" value="${productPct ?? ""}" placeholder="0–100">
        </div>
        <div>
          <label>% требований пилота ${hint(window.ITMEN_CONFIG?.fieldHints?.pilotReqPct || "")}</label>
          <input type="number" min="0" max="100" id="f-pilotReqPct" value="${pilotPct ?? ""}" placeholder="0–100">
        </div>
      </div>
      <div class="muted">Подставляются из индексов реализуемости на вкладках «Пилот» и «Продукт»; влияют на критерий «Техн. соответствие» в скоринге.</div>
    </div>`;
}

function syncSeekOtherLabelToPanels() {
  const top = document.getElementById("seek-other-label-top");
  const panel = document.getElementById("seek-other-label");
  if (top && panel) panel.value = top.value;
  updateOtherSegmentTitles();
}

function syncTechSegmentPanels() {
  const segs = [...document.querySelectorAll(".seg-seek-cb:checked")].map(x => x.value);
  syncSeekOtherWrap();
  const asis = document.getElementById("asis-panel");
  const pain = document.getElementById("pain-panel");
  const comp = document.getElementById("comp-panel");
  if (!asis || !pain) return;
  if (!segs.length) {
    asis.innerHTML = `<div class="muted">Сначала выберите сегменты в блоке 1</div>`;
    pain.innerHTML = `<div class="muted">Появится после выбора сегментов</div>`;
    if (comp) comp.innerHTML = `<div class="muted">Появится после выбора сегментов</div>`;
    return;
  }
  const prev = collectTechResearch();
  const trCtx = { seekingOtherLabel: prev.seekingOtherLabel };
  asis.innerHTML = segs.map(id => renderSegmentAsIsRow(id, prev.asIsStack[id], trCtx)).join("");
  pain.innerHTML = segs.map(id => renderSegmentPainRow(id, prev.changePains[id], trCtx)).join("");
  if (comp) comp.innerHTML = segs.map(id => renderSegmentCompetitorBlock(id, prev.competitorEntries[id], trCtx)).join("");
  syncSeekOtherLabelToPanels();
  if (typeof bindAutoGrowTextareas === "function") {
    bindAutoGrowTextareas(document.getElementById("asis-panel"));
    bindAutoGrowTextareas(document.getElementById("pain-panel"));
    bindAutoGrowTextareas(document.getElementById("comp-panel"));
  }
}

function renderVendorDropdownOptions(results) {
  if (!results.length) {
    return `<div class="vendor-opt muted">Не найдено — введите вендор/продукт вручную ниже</div>`;
  }
  return results.map(v =>
    `<div class="vendor-opt${v.preset ? " vendor-opt-preset" : ""}" data-key="${encodeURIComponent(v.key)}" onmousedown="selectVendorOpt(this)">
      <span>${escapeHtml(v.label)}</span>
      <small>${v.preset ? "быстрый выбор" : `${escapeHtml(v.country || "")}${(v.classes || []).length ? " · " + escapeHtml(v.classes[0]) : ""}`}</small>
    </div>`
  ).join("");
}

function onVendorSearch(inp) {
  const picker = inp.closest(".vendor-picker");
  if (!picker) return;
  const run = () => {
    const segId = picker.dataset.seg;
    const dd = picker.querySelector(".vendor-dropdown");
    const results = searchVendorCatalog(inp.value, segId);
    dd.innerHTML = renderVendorDropdownOptions(results);
    dd.classList.add("open");
  };
  if (window.ensureArchitectureLoaded && !window.ITMEN_ARCHITECTURE) {
    window.ensureArchitectureLoaded().then(() => {
      window._itmenCatalogCache = null;
      run();
    }).catch(() => run());
    return;
  }
  run();
}

function hideVendorDropdownDelayed(inp) {
  clearTimeout(window._vendorHideTimer);
  window._vendorHideTimer = setTimeout(() => {
    inp.closest(".vendor-picker")?.querySelector(".vendor-dropdown")?.classList.remove("open");
  }, 180);
}

function selectVendorOpt(el) {
  const key = decodeURIComponent(el.dataset.key || "");
  const picker = el.closest(".vendor-picker");
  if (!picker || !key) return;
  const item = findCatalogItem(key);
  if (!item) return;
  picker.querySelector(".vendor-search").value = item.label;
  picker.querySelector(".seg-vendor").value = item.vendor;
  picker.querySelector(".seg-product").value = item.product;
  picker.querySelector(".seg-catalog-key").value = key;
  picker.querySelector(".vendor-dropdown")?.classList.remove("open");
}

function clearVendorPicker(btn) {
  const picker = btn.closest(".vendor-picker");
  if (!picker) return;
  picker.querySelector(".vendor-search").value = "";
  picker.querySelector(".seg-vendor").value = "";
  picker.querySelector(".seg-product").value = "";
  picker.querySelector(".seg-catalog-key").value = "";
}

function addTaskRow() {
  const panel = document.getElementById("project-tasks-panel");
  if (!panel) return;
  const row = document.createElement("div");
  row.className = "task-row";
  row.innerHTML = `<textarea class="proj-task-input auto-grow" rows="1" placeholder="Задача проекта"></textarea>
    <button type="button" class="btn btn-sm btn-danger task-remove" onclick="removeTaskRow(this)" title="Удалить">✕</button>`;
  panel.appendChild(row);
  const ta = row.querySelector("textarea");
  if (typeof bindAutoGrowTextarea === "function") bindAutoGrowTextarea(ta);
  ta?.focus();
}

function removeTaskRow(btn) {
  const panel = document.getElementById("project-tasks-panel");
  const row = btn.closest(".task-row");
  if (!panel || !row) return;
  if (panel.querySelectorAll(".task-row").length <= 1) {
    const ta = row.querySelector(".proj-task-input");
    if (ta) ta.value = "";
    if (typeof autoGrowTextarea === "function") autoGrowTextarea(ta);
    return;
  }
  row.remove();
}

function collectTechResearch() {
  const tr = defaultTechResearch();
  tr.seekingSegments = [...document.querySelectorAll(".seg-seek-cb:checked")].map(x => x.value);
  tr.seekingOtherLabel = (
    document.getElementById("seek-other-label")?.value ||
    document.getElementById("seek-other-label-top")?.value ||
    ""
  ).trim();
  if (tr.seekingSegments.includes(OTHER_SEGMENT_ID) && !tr.seekingOtherLabel) {
    tr.seekingOtherLabel = "";
  }
  tr.projectTasks = [...document.querySelectorAll(".proj-task-input")]
    .map(x => x.value.trim()).filter(Boolean);
  const prod = document.getElementById("f-productReqPct")?.value;
  const pilot = document.getElementById("f-pilotReqPct")?.value;
  tr.productRequirementsPct = prod !== "" && prod != null ? +prod : null;
  tr.pilotRequirementsPct = pilot !== "" && pilot != null ? +pilot : null;

  tr.seekingSegments.forEach(segId => {
    const asisRow = document.querySelector(`.seg-row[data-seg="${segId}"]`);
    if (asisRow) {
      const vendor = asisRow.querySelector(".seg-vendor")?.value?.trim() || "";
      const product = asisRow.querySelector(".seg-product")?.value?.trim() || "";
      const catKey = asisRow.querySelector(".seg-catalog-key")?.value || "";
      tr.asIsStack[segId] = {
        vendor,
        product,
        comment: asisRow.querySelector(".seg-comment")?.value || "",
        catalogKey: catKey || (vendor ? `${vendor}|||${product}` : ""),
        custom: !catKey,
      };
    }
    const painRow = document.querySelector(`.seg-pain-row[data-seg="${segId}"]`);
    if (painRow) tr.changePains[segId] = painRow.querySelector(".seg-pain")?.value || "";

    tr.competitorEntries[segId] = [];
    document.querySelectorAll(`.comp-seg-block[data-seg="${segId}"] .comp-row`).forEach(row => {
      const picker = row.querySelector(".vendor-picker");
      const vendor = picker?.querySelector(".seg-vendor")?.value?.trim() || "";
      const product = picker?.querySelector(".seg-product")?.value?.trim() || "";
      const catKey = picker?.querySelector(".seg-catalog-key")?.value || "";
      const status = row.querySelector(".comp-status")?.value || "evaluating";
      tr.competitorEntries[segId].push({
        vendor,
        product,
        catalogKey: catKey,
        status,
        rejectReason: row.querySelector(".comp-reject")?.value || "",
        continueReason: row.querySelector(".comp-continue")?.value || "",
        comment: row.querySelector(".comp-comment")?.value || "",
      });
    });
    tr.competitorEntries[segId] = tr.competitorEntries[segId].filter(
      e => e.vendor || e.product || e.comment || e.rejectReason || e.continueReason
    );
  });
  return tr;
}

function renderBudgetPlannedFields(month, year, budgetStatus) {
  const months = window.ITMEN_ARCHITECTURE?.months || ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  const years = window.ITMEN_ARCHITECTURE?.years || [2026, 2027, 2028];
  const show = budgetStatus === "Планируется согласование";
  return `<div id="budget-planned-wrap" class="form-grid" style="display:${show ? "grid" : "none"};grid-column:1/-1">
    <div><label>Месяц согласования</label>
      <select id="f-budgetPlannedMonth">${months.map((m, i) =>
        `<option value="${i + 1}" ${(+month === i + 1) ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}
      </select></div>
    <div><label>Год согласования</label>
      <select id="f-budgetPlannedYear">${years.map(y =>
        `<option value="${y}" ${+year === y ? "selected" : ""}>${y}</option>`).join("")}
      </select></div>
  </div>`;
}

function toggleBudgetPlannedDate() {
  const st = document.getElementById("f-budgetStatus")?.value;
  const wrap = document.getElementById("budget-planned-wrap");
  if (wrap) wrap.style.display = st === "Планируется согласование" ? "grid" : "none";
}

function hint(text) {
  return `<span class="field-hint" title="${escapeHtml(text)}">ⓘ</span>`;
}

function parseAsIsString(str) {
  const out = {};
  if (!str) return out;
  str.split(";").forEach(part => {
    const [seg, rest] = part.split("=");
    if (!seg || !rest) return;
    const [vendor, product] = rest.split("|");
    out[seg.trim()] = { vendor: (vendor || "").trim(), product: (product || "").trim(), custom: true };
  });
  return out;
}

function parsePainsString(str) {
  const out = {};
  if (!str) return out;
  str.split(";").forEach(part => {
    const idx = part.indexOf(":");
    if (idx < 0) return;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

function parseTasksString(str) {
  if (!str) return [];
  return String(str).split(/[\n;]/).map(s => s.trim()).filter(Boolean);
}

function parseCompetitorsString(str) {
  const out = {};
  if (!str) return out;
  str.split(";").forEach(part => {
    part = part.trim();
    if (!part) return;
    const eq = part.indexOf("=");
    if (eq < 0) return;
    const seg = part.slice(0, eq).trim();
    const fields = part.slice(eq + 1).split("|");
    const entry = {
      vendor: (fields[0] || "").trim(),
      product: (fields[1] || "").trim(),
      status: (fields[2] || "evaluating").trim(),
      rejectReason: (fields[3] || "").trim(),
      continueReason: (fields[4] || "").trim(),
      comment: (fields[5] || "").trim(),
    };
    if (!out[seg]) out[seg] = [];
    out[seg].push(entry);
  });
  return out;
}

function techResearchFromImport(row) {
  const segs = (row["Что ищут"] || row["seeking"] || "").split(/[;,]/).map(s => s.trim()).filter(Boolean);
  const tasks = parseTasksString(row["Ключевые задачи"] || "");
  const extra = parseTasksString(row["Свои задачи"] || "");
  return migrateTechResearch({
    seekingSegments: segs,
    asIsStack: parseAsIsString(row["As-IS"] || row["as_is"] || ""),
    changePains: parsePainsString(row["Боли смены"] || row["pains_change"] || ""),
    competitorEntries: parseCompetitorsString(row["Конкуренты"] || row["Конкурентный анализ"] || ""),
    projectTasks: [...tasks, ...extra],
    productRequirementsPct: row["% продукта"] != null ? +row["% продукта"] : (+row["product_pct"] || null),
    pilotRequirementsPct: row["% пилота"] != null ? +row["% пилота"] : (+row["pilot_pct"] || null),
  });
}
