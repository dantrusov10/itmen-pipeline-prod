/* Поисковый справочник партнёров / технологических партнёров */

let _partnerRefCache = null;
let _partnerRefCacheAt = 0;
const PARTNER_REF_CACHE_MS = 60_000;

function renderPartnerPickerHtml(id, value, opts = {}) {
  const emptyLabel = opts.emptyLabel || "Нет партнёра";
  const disabled = opts.disabled ? "disabled" : "";
  const raw = String(value || "").trim();
  const display = raw && !isPartnerEmptyValue(raw) ? raw : "";
  const hiddenVal = raw || emptyLabel;
  return `<div class="partner-picker vendor-picker" data-empty="${escapeHtml(emptyLabel)}">
    <input type="text" class="vendor-search partner-ref-search" autocomplete="off"
      value="${escapeHtml(display)}"
      placeholder="Поиск партнёра / дистрибьютора…"
      oninput="onPartnerRefSearch(this)" onfocus="onPartnerRefSearch(this)" onblur="hidePartnerRefDropdownDelayed(this)"
      ${disabled}>
    <input type="hidden" id="${escapeHtml(id)}" class="partner-ref-hidden" value="${escapeHtml(hiddenVal)}">
    <div class="vendor-dropdown partner-ref-dropdown"></div>
  </div>`;
}

function isPartnerEmptyValue(v) {
  const n = String(v || "").trim().toLowerCase().replace(/ё/g, "е");
  return !n || n === "нет партнёра" || n === "нет партнера" || n === "нет дистрибьютора" || n === "без партнёра";
}

function getPartnerRefValue(id) {
  const hidden = document.getElementById(id);
  if (hidden) return hidden.value || "";
  const inp = document.getElementById(id);
  return inp?.value || "";
}

function setPartnerRefValue(picker, name) {
  if (!picker) return;
  const empty = picker.dataset.empty || "Нет партнёра";
  const val = String(name || "").trim() || empty;
  const hidden = picker.querySelector(".partner-ref-hidden");
  const search = picker.querySelector(".partner-ref-search");
  if (hidden) hidden.value = val;
  if (search) search.value = isPartnerEmptyValue(val) ? "" : val;
  picker.querySelector(".partner-ref-dropdown")?.classList.remove("open");
}

async function fetchPartnerRefs(q) {
  const now = Date.now();
  if (!q && _partnerRefCache && now - _partnerRefCacheAt < PARTNER_REF_CACHE_MS) {
    return _partnerRefCache;
  }
  const data = await crmFetch(`/api/partner-refs/search?q=${encodeURIComponent(q || "")}&limit=50`);
  const items = data?.items || [];
  if (!q) {
    _partnerRefCache = items;
    _partnerRefCacheAt = now;
  }
  return items;
}

function renderPartnerRefOptions(items) {
  if (!items.length) {
    return `<div class="vendor-opt muted" style="cursor:default">Ничего не найдено</div>`;
  }
  return items.map(it => {
    const src = (it.sources || []).includes("tech_partners") ? "тех. партнёр"
      : (it.sources || []).includes("distributors") ? "дистрибьютор"
      : (it.sources || []).includes("partners") ? "партнёр"
      : (it.preset ? "быстрый выбор" : "");
    return `<div class="vendor-opt${it.preset ? " vendor-opt-preset" : ""}" data-name="${escapeHtml(it.name)}" onmousedown="selectPartnerRefOpt(this)">
      <span>${escapeHtml(it.name)}</span>
      ${src ? `<small>${escapeHtml(src)}</small>` : ""}
    </div>`;
  }).join("");
}

async function onPartnerRefSearch(inp) {
  const picker = inp.closest(".partner-picker");
  if (!picker || inp.disabled) return;
  const dd = picker.querySelector(".partner-ref-dropdown");
  try {
    const items = await fetchPartnerRefs(inp.value.trim());
    dd.innerHTML = renderPartnerRefOptions(items);
    dd.classList.add("open");
  } catch (e) {
    dd.innerHTML = `<div class="vendor-opt muted">${escapeHtml(e.message || "Ошибка загрузки")}</div>`;
    dd.classList.add("open");
  }
}

function hidePartnerRefDropdownDelayed(inp) {
  clearTimeout(window._partnerRefHideTimer);
  window._partnerRefHideTimer = setTimeout(() => {
    const picker = inp.closest(".partner-picker");
    picker?.querySelector(".partner-ref-dropdown")?.classList.remove("open");
    const hidden = picker?.querySelector(".partner-ref-hidden");
    const typed = String(inp.value || "").trim();
    if (hidden && typed) hidden.value = typed;
    else if (hidden && !typed) hidden.value = picker.dataset.empty || "Нет партнёра";
  }, 180);
}

function selectPartnerRefOpt(el) {
  const name = el.dataset.name || "";
  const picker = el.closest(".partner-picker");
  setPartnerRefValue(picker, name);
}

window.renderPartnerPickerHtml = renderPartnerPickerHtml;
window.onPartnerRefSearch = onPartnerRefSearch;
window.hidePartnerRefDropdownDelayed = hidePartnerRefDropdownDelayed;
window.selectPartnerRefOpt = selectPartnerRefOpt;
window.getPartnerRefValue = getPartnerRefValue;
window.isPartnerEmptyValue = isPartnerEmptyValue;
