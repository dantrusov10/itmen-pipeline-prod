/* Панель фильтров в стиле amoCRM — общая для канбана, дашборда, сделок */

function amoFilterIsRange(col) {
  return col.filter === "range" || col.num;
}

function amoFilterGetRange(filters, key) {
  return {
    from: filters[`${key}__from`] ?? "",
    to: filters[`${key}__to`] ?? "",
  };
}

function amoFilterSetRange(filters, key, from, to) {
  if (from !== "" && from != null) filters[`${key}__from`] = from;
  else delete filters[`${key}__from`];
  if (to !== "" && to != null) filters[`${key}__to`] = to;
  else delete filters[`${key}__to`];
}

function amoFilterGetMultiselect(filters, key) {
  const v = filters[key];
  if (!v) return [];
  return Array.isArray(v) ? v : [String(v)];
}

function amoFilterSetMultiselect(filters, key, vals) {
  if (vals?.length) filters[key] = vals;
  else delete filters[key];
}

function amoFilterActiveCount(filters, cols) {
  let n = 0;
  (cols || []).forEach(col => {
    if (amoFilterIsRange(col)) {
      if (filters[`${col.key}__from`] || filters[`${col.key}__to`]) n++;
    } else if (amoFilterGetMultiselect(filters, col.key).length) n++;
    else if ((filters[col.key] || "").toString().trim()) n++;
  });
  return n;
}

function dealMatchesAmoFilters(d, filters, cols, scoringOpts) {
  const opts = scoringOpts != null
    ? scoringOpts
    : (typeof getDealsScoringOpts === "function" ? getDealsScoringOpts() : null);
  const enriched = typeof enrichDeal === "function" ? enrichDeal(d, opts) : d;
  const columns = cols || (typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : []);
  for (const col of columns) {
    if (amoFilterIsRange(col)) {
      const from = parseFilterNum(filters[`${col.key}__from`]);
      const to = parseFilterNum(filters[`${col.key}__to`]);
      if (from == null && to == null) continue;
      const raw = col.get(enriched);
      const n = raw == null || raw === "" ? null : Number(raw);
      if (n == null || !Number.isFinite(n)) return false;
      if (from != null && n < from) return false;
      if (to != null && n > to) return false;
      continue;
    }
    const selected = amoFilterGetMultiselect(filters, col.key);
    if (selected.length) {
      const text = typeof dealCellText === "function" ? dealCellText(col, enriched) : String(col.get(enriched) ?? "—");
      if (!selected.includes(text || "—")) return false;
      continue;
    }
    const textQ = (filters[col.key] || "").toString().trim();
    if (textQ) {
      const text = typeof dealCellText === "function" ? dealCellText(col, enriched) : String(col.get(enriched) ?? "");
      if (!text.toLowerCase().includes(textQ.toLowerCase())) return false;
    }
  }
  return true;
}

function renderAmoFilterPanelHTML(opts) {
  const { filters, draft, cols, deals, expandedKey, fieldSearch } = opts;
  const q = (fieldSearch || "").trim().toLowerCase();
  const allCols = cols || [];
  const filtered = allCols.filter(col =>
    !q || col.label.toLowerCase().includes(q) || col.key.toLowerCase().includes(q)
  );
  const isActive = col => {
    if (amoFilterIsRange(col)) return !!(draft[`${col.key}__from`] || draft[`${col.key}__to`]);
    return amoFilterGetMultiselect(draft, col.key).length > 0 || !!(draft[col.key] || "").toString().trim();
  };
  const columns = [...filtered].sort((a, b) => {
    const aa = isActive(a) ? 0 : 1;
    const ba = isActive(b) ? 0 : 1;
    if (aa !== ba) return aa - ba;
    return a.label.localeCompare(b.label, "ru");
  });
  const rows = columns.map(col => {
    const isRange = amoFilterIsRange(col);
    const isOpen = expandedKey === col.key;
    const hasVal = isRange
      ? (draft[`${col.key}__from`] || draft[`${col.key}__to`])
      : amoFilterGetMultiselect(draft, col.key).length;
    let body = "";
    if (isOpen) {
      if (isRange) {
        const r = amoFilterGetRange(draft, col.key);
        body = `<div class="amo-f-body amo-f-range">
          <input type="number" class="amo-f-from" data-key="${col.key}" placeholder="от" value="${escapeHtml(r.from)}">
          <span class="muted">—</span>
          <input type="number" class="amo-f-to" data-key="${col.key}" placeholder="до" value="${escapeHtml(r.to)}">
        </div>`;
      } else {
        const options = typeof getDistinctDealColValues === "function"
          ? getDistinctDealColValues(col, deals)
          : [];
        const sel = new Set(amoFilterGetMultiselect(draft, col.key));
        const show = options.slice(0, 80);
        body = `<div class="amo-f-body">
          <div class="amo-f-ms-actions">
            <button type="button" class="btn btn-sm amo-f-all" data-key="${col.key}">Все</button>
            <button type="button" class="btn btn-sm amo-f-none" data-key="${col.key}">Снять</button>
          </div>
          <div class="amo-f-ms-list">${show.map(o =>
            `<label class="amo-f-opt"><input type="checkbox" class="amo-f-cb" data-key="${col.key}" value="${escapeHtml(o)}"${sel.has(o) ? " checked" : ""}><span>${escapeHtml(o)}</span></label>`
          ).join("")}${options.length > 80 ? `<p class="muted" style="font-size:.75rem;padding:.25rem">+ ещё ${options.length - 80}</p>` : ""}</div>
        </div>`;
      }
    }
    return `<div class="amo-f-row${isOpen ? " open" : ""}${hasVal ? " active" : ""}" data-key="${col.key}">
      <button type="button" class="amo-f-head">${escapeHtml(col.label)}${hasVal ? " ●" : ""}</button>
      ${body}
    </div>`;
  }).join("");

  return `<div class="amo-filter-panel">
    <div class="amo-filter-panel-head">
      <span class="amo-filter-panel-title">Фильтры</span>
      <button type="button" class="amo-filter-close" title="Закрыть">✕</button>
    </div>
    <div class="amo-filter-search-wrap">
      <input type="search" class="amo-f-search" placeholder="Поиск поля…" value="${escapeHtml(fieldSearch || "")}">
    </div>
    <div class="amo-filter-scroll">${rows || `<p class="muted amo-f-empty">Ничего не найдено</p>`}</div>
    <div class="amo-filter-foot">
      <button type="button" class="btn btn-primary btn-sm amo-f-apply">Применить</button>
      <button type="button" class="btn btn-sm amo-f-reset">Сбросить</button>
    </div>
  </div>`;
}

function mountAmoFilterPanel(hostEl, opts) {
  if (!hostEl) return null;
  const cols = opts.cols || (typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : []);
  const deals = opts.deals || (state?.deals || []);
  let draft = structuredClone(opts.filters || {});
  const appliedFilters = structuredClone(opts.filters || {});
  let expandedKey = opts.expandedKey || null;
  let fieldSearch = opts.fieldSearch || "";

  const paint = (paintOpts = {}) => {
    const searchEl = hostEl.querySelector(".amo-f-search");
    const hadFocus = searchEl && document.activeElement === searchEl;
    const selStart = hadFocus ? searchEl.selectionStart : null;
    const selEnd = hadFocus ? searchEl.selectionEnd : null;
    const scrollEl = hostEl.querySelector(".amo-filter-scroll");
    const scrollTop = paintOpts.preserveScroll && scrollEl ? scrollEl.scrollTop : 0;
    hostEl.innerHTML = renderAmoFilterPanelHTML({ filters: appliedFilters, draft, cols, deals, expandedKey, fieldSearch });
    bind();
    if (paintOpts.preserveScroll) {
      const newScrollEl = hostEl.querySelector(".amo-filter-scroll");
      if (newScrollEl) newScrollEl.scrollTop = scrollTop;
    }
    const newSearch = hostEl.querySelector(".amo-f-search");
    if (hadFocus && newSearch) {
      newSearch.focus();
      const pos = selStart != null ? selStart : newSearch.value.length;
      try { newSearch.setSelectionRange(pos, selEnd != null ? selEnd : pos); } catch (_) {}
    }
  };

  const bind = () => {
    hostEl.querySelector(".amo-filter-close")?.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      opts.onClose?.();
    });
    hostEl.querySelector(".amo-f-search")?.addEventListener("input", e => {
      fieldSearch = e.target.value;
      paint({ preserveScroll: false });
    });
    hostEl.querySelectorAll(".amo-f-head").forEach(btn => {
      btn.onclick = () => {
        expandedKey = expandedKey === btn.closest(".amo-f-row")?.dataset.key
          ? null
          : btn.closest(".amo-f-row")?.dataset.key;
        paint({ preserveScroll: true });
      };
    });
    hostEl.querySelectorAll(".amo-f-from").forEach(inp => {
      inp.oninput = () => amoFilterSetRange(draft, inp.dataset.key, inp.value, draft[`${inp.dataset.key}__to`]);
    });
    hostEl.querySelectorAll(".amo-f-to").forEach(inp => {
      inp.oninput = () => amoFilterSetRange(draft, inp.dataset.key, draft[`${inp.dataset.key}__from`], inp.value);
    });
    hostEl.querySelectorAll(".amo-f-cb").forEach(cb => {
      cb.onchange = () => {
        const key = cb.dataset.key;
        const vals = [...hostEl.querySelectorAll(`.amo-f-cb[data-key="${key}"]:checked`)].map(x => x.value);
        amoFilterSetMultiselect(draft, key, vals);
      };
    });
    hostEl.querySelectorAll(".amo-f-all").forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        hostEl.querySelectorAll(`.amo-f-cb[data-key="${key}"]`).forEach(cb => { cb.checked = true; });
        const vals = [...hostEl.querySelectorAll(`.amo-f-cb[data-key="${key}"]`)].map(x => x.value);
        amoFilterSetMultiselect(draft, key, vals);
      };
    });
    hostEl.querySelectorAll(".amo-f-none").forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        hostEl.querySelectorAll(`.amo-f-cb[data-key="${key}"]`).forEach(cb => { cb.checked = false; });
        amoFilterSetMultiselect(draft, key, []);
      };
    });
    hostEl.querySelector(".amo-f-apply")?.addEventListener("click", () => {
      opts.onApply(structuredClone(draft));
    });
    hostEl.querySelector(".amo-f-reset")?.addEventListener("click", () => {
      draft = {};
      expandedKey = null;
      fieldSearch = "";
      opts.onReset?.();
      opts.onApply?.(structuredClone(draft));
    });
  };

  paint();
  return { refresh: paint };
}

window.dealMatchesAmoFilters = dealMatchesAmoFilters;
window.amoFilterActiveCount = amoFilterActiveCount;
window.mountAmoFilterPanel = mountAmoFilterPanel;
window.amoFilterGetMultiselect = amoFilterGetMultiselect;

function getUnifiedFilterCols() {
  return typeof getKanbanFilterCols === "function" ? getKanbanFilterCols() : [];
}
window.getUnifiedFilterCols = getUnifiedFilterCols;
