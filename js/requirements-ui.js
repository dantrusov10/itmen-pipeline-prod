/* Требования к пилоту / продукту (логика clientmap) */

const REQ_FEAS_SCORE = {
  "полностью": 1,
  "частично": 0.6,
  "нет": 0,
  "нет возможности": 0,
  "хард код (скоро)": 0.7,
  "хард код (не скоро)": 0.3,
  "требуется скрипт": 0.5,
};

function calcFeasibilityPctFromRows(rows, kind) {
  const scores = [];
  for (const r of rows || []) {
    if (kind === "pilot") {
      if (!String(r.clientRequirement || r.client_requirement || "").trim()
        && !String(r.businessNeed || r.business_need || "").trim()) continue;
    } else if (!String(r.functionalRequirement || r.functional_requirement || "").trim()
      && !String(r.businessRequirement || r.business_requirement || "").trim()) continue;
    let s = r.feasibilityScore ?? r.feasibility_score;
    if (s == null && r.feasibility) {
      s = REQ_FEAS_SCORE[String(r.feasibility).trim().toLowerCase()];
    }
    if (s != null && !Number.isNaN(Number(s))) scores.push(Number(s));
  }
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}

function resolveFeasibilityPct(data, kind) {
  const computed = calcFeasibilityPctFromRows(data?.rows || [], kind);
  const stored = data?.feasibilityPct;
  if (computed != null && (stored == null || stored === 0)) return computed;
  if (stored != null) return stored;
  return computed;
}

const REQ_FEAS_OPTIONS = [
  "—", "Полностью", "Частично", "Нет", "Нет возможности",
  "Хард код (скоро)", "Хард код (не скоро)", "Требуется скрипт",
];
const REQ_TYPES = ["Тех", "ИБ", "Бизнес", "Интеграции", "Отчеты"];

function reqFeasOptionsHtml(selected) {
  return REQ_FEAS_OPTIONS.map(o =>
    `<option value="${escapeHtml(o)}"${o === selected ? " selected" : ""}>${escapeHtml(o)}</option>`
  ).join("");
}

function reqTypesHtml(selected) {
  return REQ_TYPES.map(o =>
    `<option value="${escapeHtml(o)}"${o === selected ? " selected" : ""}>${escapeHtml(o)}</option>`
  ).join("");
}

function renderReqSummary(deal, data, kind) {
  const dealObj = (typeof state !== "undefined" && state?.deals && editingDealIdx != null)
    ? state.deals[editingDealIdx] : null;
  const presale = dealObj?.capabilities || dealObj?.partner || "—";
  const pct = resolveFeasibilityPct(data, kind === "product" ? "product" : "pilot");
  const cnt = data.count ?? (data.rows || []).length;
  const updated = data.updatedAt ? (typeof formatRuDate === "function" ? formatRuDate(data.updatedAt) : String(data.updatedAt).slice(0, 10)) : "—";
  return `<div class="req-summary-bar">
    <span><b>Компания:</b> ${escapeHtml(dealObj?.customer || "—")}</span>
    <span><b>Pre-Sale:</b> ${escapeHtml(presale)}</span>
    <span><b>Вероятность:</b> ${pct != null ? pct + "%" : "—"}</span>
    <span><b>Строк:</b> ${cnt}</span>
    <span><b>Обновлено:</b> ${escapeHtml(updated)}</span>
  </div>`;
}

function renderPilotRequirementsTab(dealId, data, editable) {
  const pct = resolveFeasibilityPct(data, "pilot");
  const rows = data.rows || [];
  const dis = editable ? "" : "disabled";
  return `
    ${renderReqSummary(dealId, data, "pilot")}
    <div class="req-tab-head">
      <div>
        <strong>Требования к пилоту</strong>
        <div class="muted">Индекс реализуемости: <span id="pilot-feas-pct" class="req-pct">${pct != null ? pct + "%" : "—"}</span></div>
      </div>
      ${editable ? `<div class="req-actions">
        <button type="button" class="btn btn-sm" id="pilot-req-template">Скачать карту</button>
        <label class="btn btn-sm" style="margin:0;cursor:pointer">Выбрать файл<input type="file" id="pilot-req-import-file" accept=".xlsx,.xls" hidden></label>
        <button type="button" class="btn btn-sm" id="pilot-req-import-apply" disabled>Загрузить</button>
        <span class="req-import-pending" id="pilot-req-import-name" hidden></span>
        <button type="button" class="btn btn-sm" id="pilot-req-add">+ Добавить</button>
        <button type="button" class="btn btn-primary btn-sm" id="pilot-req-save">Сохранить</button>
      </div>` : ""}
    </div>
    <div class="req-table-wrap">
      <table class="req-table" id="pilot-req-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Бизнес-потребность</th>
            <th>Требование клиента</th>
            <th>Тип</th>
            <th>Обязат.</th>
            <th>Возможность</th>
            <th>Метрика проверки</th>
            ${editable ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody id="pilot-req-tbody">
          ${rows.map((r, i) => pilotReqRowHtml(r, i + 1, editable)).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted">Возможность влияет на % реализуемости и критерий «Техн. соответствие» в скоринге.</p>
  `;
}

function pilotReqRowHtml(r, num, editable) {
  const dis = editable ? "" : "disabled";
  const biz = r.businessNeed || (!r.verificationMetric && r.owner ? r.owner : "") || "";
  const feas = r.feasibility || "—";
  const feasMissing = r._imported && (feas === "—" || !feas);
  const feasCls = feasMissing ? " req-feas-missing" : "";
  return `<tr class="req-row${feasMissing ? " req-row-feas-missing" : ""}" data-idx="${num - 1}">
    <td class="req-num">${num}</td>
    <td><textarea class="req-biz auto-grow" rows="1" ${dis}>${escapeHtml(biz)}</textarea></td>
    <td><textarea class="req-text auto-grow" rows="1" ${dis}>${escapeHtml(r.clientRequirement || "")}</textarea></td>
    <td><select class="req-type" ${dis}>${reqTypesHtml(r.reqType || "Тех")}</select></td>
    <td><select class="req-must" ${dis}>
      <option value="1"${r.isMandatory !== false ? " selected" : ""}>Да</option>
      <option value="0"${r.isMandatory === false ? " selected" : ""}>Нет</option>
    </select></td>
    <td><select class="req-feas${feasCls}" ${dis}>${reqFeasOptionsHtml(feas)}</select></td>
    <td><textarea class="req-metric auto-grow" rows="1" ${dis}>${escapeHtml(r.verificationMetric || "")}</textarea></td>
    ${editable ? `<td><button type="button" class="btn btn-sm req-del" title="Удалить">✕</button></td>` : ""}
  </tr>`;
}

function renderProductRequirementsTab(dealId, data, editable) {
  const pct = resolveFeasibilityPct(data, "product");
  const rows = data.rows || [];
  return `
    ${renderReqSummary(dealId, data, "product")}
    <div class="req-tab-head">
      <div>
        <strong>Требования к продукту</strong>
        <div class="muted">Индекс реализуемости: <span id="product-feas-pct" class="req-pct">${pct != null ? pct + "%" : "—"}</span></div>
      </div>
      ${editable ? `<div class="req-actions">
        <button type="button" class="btn btn-sm" id="product-req-add">+ Добавить</button>
        <button type="button" class="btn btn-primary btn-sm" id="product-req-save">Сохранить</button>
      </div>` : ""}
    </div>
    <div class="req-table-wrap">
      <table class="req-table" id="product-req-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Бизнес-требование</th>
            <th>Функциональное требование</th>
            <th>Тип</th>
            <th>Обязат.</th>
            <th>Возможность</th>
            ${editable ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody id="product-req-tbody">
          ${rows.map((r, i) => productReqRowHtml(r, i + 1, editable)).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted">Средний балл по «Возможность» → % требований продукта в скоринге.</p>
  `;
}

function productReqRowHtml(r, num, editable) {
  const dis = editable ? "" : "disabled";
  return `<tr class="req-row" data-idx="${num - 1}">
    <td class="req-num">${num}</td>
    <td><textarea class="req-biz auto-grow" rows="1" ${dis}>${escapeHtml(r.businessRequirement || "")}</textarea></td>
    <td><textarea class="req-func auto-grow" rows="1" ${dis}>${escapeHtml(r.functionalRequirement || "")}</textarea></td>
    <td><select class="req-type" ${dis}>${reqTypesHtml(r.reqType || "Тех")}</select></td>
    <td><select class="req-must" ${dis}>
      <option value="1"${r.isMandatory !== false ? " selected" : ""}>Да</option>
      <option value="0"${r.isMandatory === false ? " selected" : ""}>Нет</option>
    </select></td>
    <td><select class="req-feas" ${dis}>${reqFeasOptionsHtml(r.feasibility || "—")}</select></td>
    ${editable ? `<td><button type="button" class="btn btn-sm req-del" title="Удалить">✕</button></td>` : ""}
  </tr>`;
}

function collectPilotRowsFromDom() {
  return [...document.querySelectorAll("#pilot-req-tbody .req-row")].map(tr => ({
    businessNeed: tr.querySelector(".req-biz")?.value?.trim() || "",
    clientRequirement: tr.querySelector(".req-text")?.value?.trim() || "",
    reqType: tr.querySelector(".req-type")?.value || "Тех",
    isMandatory: tr.querySelector(".req-must")?.value === "1",
    feasibility: tr.querySelector(".req-feas")?.value || "—",
    verificationMetric: tr.querySelector(".req-metric")?.value?.trim() || "",
  })).filter(r => r.businessNeed || r.clientRequirement);
}

function collectProductRowsFromDom() {
  return [...document.querySelectorAll("#product-req-tbody .req-row")].map(tr => ({
    businessRequirement: tr.querySelector(".req-biz")?.value?.trim() || "",
    functionalRequirement: tr.querySelector(".req-func")?.value?.trim() || "",
    reqType: tr.querySelector(".req-type")?.value || "Тех",
    isMandatory: tr.querySelector(".req-must")?.value === "1",
    feasibility: tr.querySelector(".req-feas")?.value || "—",
  })).filter(r => r.businessRequirement || r.functionalRequirement);
}

function renumberReqTable(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  [...tbody.querySelectorAll(".req-row")].forEach((tr, i) => {
    const num = tr.querySelector(".req-num");
    if (num) num.textContent = String(i + 1);
  });
}

function applyRequirementsToDealState(dealId, pilotPct, productPct) {
  if (!dealId || !state?.deals) return;
  const idx = state.deals.findIndex(d => d.id === dealId);
  if (idx < 0) return;
  const d = state.deals[idx];
  if (!d.techResearch) d.techResearch = typeof defaultTechResearch === "function" ? defaultTechResearch() : {};
  if (pilotPct != null) d.techResearch.pilotRequirementsPct = pilotPct;
  if (productPct != null) d.techResearch.productRequirementsPct = productPct;
  d.pilotFeasibilityPct = pilotPct;
  d.productFeasibilityPct = productPct;
  if (typeof suggestScores === "function") modalSuggestion = suggestScores(d);
  if (typeof dealPassportHtml !== "undefined") dealPassportHtml = "";
  if (typeof renderDealsTable === "function" && document.getElementById("page-deals")?.classList.contains("active")) {
    renderDealsTable(typeof getEnrichedDeals === "function" ? getEnrichedDeals() : state.deals);
  }
  if (typeof renderActiveKanban === "function" && document.getElementById("page-kanban")?.classList.contains("active")) renderActiveKanban();
  else if (typeof renderKanban === "function" && document.getElementById("page-kanban")?.classList.contains("active")) renderKanban();
}

function bindPilotRequirementsEvents(dealId, editable) {
  if (!editable) return;
  if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(document.getElementById("pilot-req-table"));
  let pendingImportFile = null;

  document.getElementById("pilot-req-template")?.addEventListener("click", async () => {
    try {
      const idx = state?.deals?.findIndex(d => d.id === dealId);
      const deal = idx >= 0 ? state.deals[idx] : null;
      const rows = collectPilotRowsFromDom();
      const name = await exportPilotMapTemplate(dealId, rows, deal?.customer || dealId);
      if (typeof apiLogSystemEvent === "function") {
        try {
          await apiLogSystemEvent(dealId, {
            type: "file_uploaded",
            body: `Сформирована карта тестирования: ${name}`,
            meta: { fileName: name, docType: "pilot_map" },
          });
        } catch (_) { /* */ }
      }
      if (typeof showToast === "function") showToast(`Шаблон скачан: ${name}`);
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  const importFile = document.getElementById("pilot-req-import-file");
  const importApply = document.getElementById("pilot-req-import-apply");
  const importName = document.getElementById("pilot-req-import-name");
  importFile?.addEventListener("change", () => {
    pendingImportFile = importFile.files?.[0] || null;
    if (importApply) importApply.disabled = !pendingImportFile;
    if (importName) {
      if (pendingImportFile) {
        importName.hidden = false;
        importName.textContent = pendingImportFile.name;
      } else {
        importName.hidden = true;
        importName.textContent = "";
      }
    }
  });

  importApply?.addEventListener("click", async () => {
    if (!pendingImportFile) return;
    try {
      const parsed = await parsePilotMapXlsx(pendingImportFile);
      const tbody = document.getElementById("pilot-req-tbody");
      if (!tbody) return;
      tbody.innerHTML = parsed.rows.map((r, i) => pilotReqRowHtml(r, i + 1, true)).join("");
      if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(tbody);
      bindPilotRowDeletes();
      pendingImportFile = null;
      if (importFile) importFile.value = "";
      if (importApply) importApply.disabled = true;
      if (importName) { importName.hidden = true; importName.textContent = ""; }
      const missing = parsed.rows.filter(r => r._imported).length;
      if (typeof showToast === "function") {
        showToast(`Импортировано ${parsed.rows.length} строк · заполните «Возможность» (${missing} без оценки)`);
      }
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  document.getElementById("pilot-req-add")?.addEventListener("click", () => {
    const tbody = document.getElementById("pilot-req-tbody");
    const n = tbody.querySelectorAll(".req-row").length + 1;
    tbody.insertAdjacentHTML("beforeend", pilotReqRowHtml({}, n, true));
    if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(tbody);
    bindPilotRowDeletes();
  });
  bindPilotRowDeletes();
  document.getElementById("pilot-req-save")?.addEventListener("click", async () => {
    try {
      const rows = collectPilotRowsFromDom();
      const res = await apiSavePilotRequirements(dealId, rows);
      applyRequirementsToDealState(dealId, res.feasibilityPct, res.productFeasibilityPct);
      const el = document.getElementById("pilot-feas-pct");
      if (el) el.textContent = res.feasibilityPct != null ? `${res.feasibilityPct}%` : "—";
      if (typeof showToast === "function") showToast(`Пилот сохранён · ${res.feasibilityPct ?? "—"}%`);
    } catch (e) {
      alert(e.message || String(e));
    }
  });
}

function bindPilotRowDeletes() {
  document.querySelectorAll("#pilot-req-tbody .req-del").forEach(btn => {
    btn.onclick = () => {
      btn.closest(".req-row")?.remove();
      renumberReqTable("pilot-req-tbody");
    };
  });
}

function bindProductRequirementsEvents(dealId, editable) {
  if (!editable) return;
  if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(document.getElementById("product-req-table"));
  document.getElementById("product-req-add")?.addEventListener("click", () => {
    const tbody = document.getElementById("product-req-tbody");
    const n = tbody.querySelectorAll(".req-row").length + 1;
    tbody.insertAdjacentHTML("beforeend", productReqRowHtml({}, n, true));
    if (typeof bindAutoGrowTextareas === "function") bindAutoGrowTextareas(tbody);
    bindProductRowDeletes();
  });
  bindProductRowDeletes();
  document.getElementById("product-req-save")?.addEventListener("click", async () => {
    try {
      const rows = collectProductRowsFromDom();
      const res = await apiSaveProductRequirements(dealId, rows);
      applyRequirementsToDealState(dealId, res.pilotFeasibilityPct, res.feasibilityPct);
      const el = document.getElementById("product-feas-pct");
      if (el) el.textContent = res.feasibilityPct != null ? `${res.feasibilityPct}%` : "—";
      if (typeof showToast === "function") showToast(`Продукт сохранён · ${res.feasibilityPct ?? "—"}%`);
    } catch (e) {
      alert(e.message || String(e));
    }
  });
}

function bindProductRowDeletes() {
  document.querySelectorAll("#product-req-tbody .req-del").forEach(btn => {
    btn.onclick = () => {
      btn.closest(".req-row")?.remove();
      renumberReqTable("product-req-tbody");
    };
  });
}

function applyRequirementsHighlight(dealId, kind) {
  let payload = null;
  try {
    const raw = sessionStorage.getItem("itmen_req_highlight");
    if (raw) payload = JSON.parse(raw);
  } catch (_) { /* ignore */ }
  if (!payload || payload.dealId !== dealId) return;
  sessionStorage.removeItem("itmen_req_highlight");
  const text = String(payload.text || "").trim().toLowerCase();
  const tbodyId = (kind === "product" || payload.kind === "product") ? "product-req-tbody" : "pilot-req-tbody";
  const tbody = document.getElementById(tbodyId);
  if (!tbody || !text) return;
  const rows = [...tbody.querySelectorAll(".req-row")];
  const row = rows.find(r => {
    const cell = r.querySelector("textarea, input[type=text]");
    return String(cell?.value || "").trim().toLowerCase().includes(text)
      || text.includes(String(cell?.value || "").trim().toLowerCase().slice(0, 24));
  });
  if (!row) return;
  row.classList.add("req-row-highlight");
  row.scrollIntoView({ block: "center", behavior: "smooth" });
  setTimeout(() => row.classList.remove("req-row-highlight"), 4000);
}

window.applyRequirementsHighlight = applyRequirementsHighlight;
window.renderPilotRequirementsTab = renderPilotRequirementsTab;
window.renderProductRequirementsTab = renderProductRequirementsTab;
window.bindPilotRequirementsEvents = bindPilotRequirementsEvents;
window.bindProductRequirementsEvents = bindProductRequirementsEvents;
window.applyRequirementsToDealState = applyRequirementsToDealState;
