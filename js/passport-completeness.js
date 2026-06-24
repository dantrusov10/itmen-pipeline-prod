/* Полнота паспорта — 5 блоков + агрегация */
const PASSPORT_BLOCKS = [
  {
    id: "basic",
    label: "Базовые данные",
    short: "Базовый",
    hint: "Клиент, отрасль, владелец, стадия, суммы, партнёр, скидка партнёра (если есть), срок задачи",
  },
  {
    id: "minimal",
    label: "Минимальный набор",
    short: "Миним.",
    hint: "Вероятность, период и статус бюджета, коммит, боли, риски",
  },
  {
    id: "technical",
    label: "Тех. исследование",
    short: "Тех.",
    hint: "Что ищут, что есть сейчас, почему меняют, ключевые задачи",
  },
  {
    id: "competitive",
    label: "Конкуренты",
    short: "Конкур.",
    hint: "Заполнен конкурентный анализ",
  },
  {
    id: "requirements",
    label: "Требования",
    short: "Треб.",
    hint: "% соответствия продукта или пилота (хотя бы одно)",
  },
];

const PASSPORT_BLOCKS_STORAGE_KEY = "itmen_passport_blocks_v1";
const NO_PARTNER_VALUES = new Set(["", "нет партнёра", "без партнёра", "нет", "—", "-"]);

function loadPassportBlockSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(PASSPORT_BLOCKS_STORAGE_KEY) || "null");
    if (!Array.isArray(saved) || !saved.length) return PASSPORT_BLOCKS.map(b => b.id);
    const valid = saved.filter(id => PASSPORT_BLOCKS.some(b => b.id === id));
    return valid.length ? valid : PASSPORT_BLOCKS.map(b => b.id);
  } catch {
    return PASSPORT_BLOCKS.map(b => b.id);
  }
}

let passportBlockSelection = loadPassportBlockSelection();

function persistPassportBlockSelection() {
  try {
    localStorage.setItem(PASSPORT_BLOCKS_STORAGE_KEY, JSON.stringify(passportBlockSelection));
  } catch (e) {
    console.warn("persistPassportBlockSelection:", e);
  }
}

function hasPartnerValue(partner) {
  const p = String(partner || "").trim().toLowerCase();
  return p && !NO_PARTNER_VALUES.has(p);
}

function hasAsIsContent(tr) {
  const stack = tr?.asIsStack || {};
  return Object.values(stack).some(entry => {
    if (!entry) return false;
    if (typeof entry === "string") return !!entry.trim();
    return !!(entry.vendor?.trim() || entry.product?.trim() || entry.custom);
  });
}

function hasChangePainsContent(tr) {
  const pains = tr?.changePains || {};
  return Object.values(pains).some(v => String(v || "").trim());
}

function hasCompetitorContent(tr) {
  const entries = Object.values(tr?.competitorEntries || {}).flat().filter(Boolean);
  return entries.some(e => (e.vendor || "").trim() || (e.product || "").trim());
}

function evaluatePassportBlocks(deal) {
  const d = typeof migrateDeal === "function" ? migrateDeal(deal) : deal;
  const tr = typeof migrateTechResearch === "function" ? migrateTechResearch(d.techResearch || {}) : (d.techResearch || {});
  const risks = typeof normalizeRiskTypes === "function" ? normalizeRiskTypes(d) : [];
  const painsText = String(d.pains || "").trim();

  const basicMissing = [];
  if (!d.customer?.trim()) basicMissing.push("Клиент");
  if (!d.industry?.trim() || d.industry === "Не определена") basicMissing.push("Отрасль");
  if (!d.owner?.trim() || d.owner === "Не назначен") basicMissing.push("Владелец");
  if (!d.stage?.trim()) basicMissing.push("Стадия");
  if (!(Number(d.amount) > 0)) basicMissing.push("Ожид. сумма");
  if (!(Number(d.expectedBudget) > 0)) basicMissing.push("Ожид. бюджет");
  if (!String(d.partner ?? "").trim()) basicMissing.push("Партнёр");
  if (hasPartnerValue(d.partner) && (d.partnerDiscount == null || d.partnerDiscount === "" || Number.isNaN(+d.partnerDiscount))) {
    basicMissing.push("Скидка партнёру");
  }
  if (!String(d.taskDue || "").trim()) basicMissing.push("Срок задачи");

  const minimalMissing = [];
  if (!(Number(d.manualProb) > 0)) minimalMissing.push("Вероятность");
  if (!d.budgetPeriod?.trim() || d.budgetPeriod === "Не определён") minimalMissing.push("Период бюджета");
  if (!d.budgetStatus?.trim() || d.budgetStatus === "Неизвестно") minimalMissing.push("Статус бюджета");
  if (!d.commitStatus || d.commitStatus === "none") minimalMissing.push("Статус коммита");
  if (!painsText && !d.hasPains) minimalMissing.push("Ключевые боли");
  if (!risks.length && !String(d.riskComment || "").trim()) minimalMissing.push("Риски");

  const technicalMissing = [];
  if (!(tr.seekingSegments || []).length) technicalMissing.push("Что ищут");
  if (!hasAsIsContent(tr)) technicalMissing.push("Что есть сейчас");
  if (!hasChangePainsContent(tr)) technicalMissing.push("Почему меняют");
  if (!(tr.projectTasks || []).filter(t => String(t || "").trim()).length) technicalMissing.push("Ключевые задачи");

  const competitiveMissing = [];
  if (!hasCompetitorContent(tr)) competitiveMissing.push("Конкуренты");

  const requirementsMissing = [];
  const hasProduct = tr.productRequirementsPct != null && tr.productRequirementsPct !== "";
  const hasPilot = tr.pilotRequirementsPct != null && tr.pilotRequirementsPct !== "";
  if (!hasProduct && !hasPilot) requirementsMissing.push("% продукта или пилота");

  const blocks = {
    basic: basicMissing.length === 0,
    minimal: minimalMissing.length === 0,
    technical: technicalMissing.length === 0,
    competitive: competitiveMissing.length === 0,
    requirements: requirementsMissing.length === 0,
  };

  const missing = {
    basic: basicMissing,
    minimal: minimalMissing,
    technical: technicalMissing,
    competitive: competitiveMissing,
    requirements: requirementsMissing,
  };

  return { blocks, missing };
}

function isPassportCompleteForBlocks(blockStatus, selectedIds) {
  const ids = selectedIds?.length ? selectedIds : PASSPORT_BLOCKS.map(b => b.id);
  return ids.every(id => blockStatus.blocks[id]);
}

function calcPassportCompletenessStats(deals, selectedIds) {
  const ids = selectedIds?.length ? selectedIds : PASSPORT_BLOCKS.map(b => b.id);
  const evaluated = (deals || []).map(d => {
    const status = evaluatePassportBlocks(d);
    return {
      deal: d,
      ...status,
      completeForSelection: isPassportCompleteForBlocks(status, ids),
    };
  });

  const total = evaluated.length;
  const complete = evaluated.filter(x => x.completeForSelection).length;
  const byBlock = {};
  PASSPORT_BLOCKS.forEach(b => {
    const ok = evaluated.filter(x => x.blocks[b.id]).length;
    byBlock[b.id] = { complete: ok, total, pct: total ? ok / total : 0 };
  });

  return {
    total,
    complete,
    incomplete: total - complete,
    pct: total ? complete / total : 0,
    selectedIds: ids,
    byBlock,
    evaluated,
  };
}

function calcManagerPassportStats(deals, selectedIds) {
  const byOwner = {};
  (deals || []).forEach(d => {
    const owner = d.owner || "Не назначен";
    if (!byOwner[owner]) byOwner[owner] = [];
    byOwner[owner].push(d);
  });

  return Object.entries(byOwner)
    .map(([owner, ownerDeals]) => {
      const stats = calcPassportCompletenessStats(ownerDeals, selectedIds);
      const ids = selectedIds?.length ? selectedIds : PASSPORT_BLOCKS.map(b => b.id);
      const blockPcts = ids.map(id => stats.byBlock?.[id]?.pct ?? 0);
      const avgBlockPct = blockPcts.length ? blockPcts.reduce((a, b) => a + b, 0) / blockPcts.length : 0;
      return {
        owner,
        count: stats.total,
        complete: stats.complete,
        incomplete: stats.incomplete,
        pct: stats.pct,
        avgBlockPct,
        byBlock: stats.byBlock,
      };
    })
    .sort((a, b) => b.count - a.count || b.pct - a.pct);
}

function calcTopRisks(deals, limit = 8) {
  const counts = {};
  const add = (label) => {
    if (!label) return;
    counts[label] = (counts[label] || 0) + 1;
  };

  (deals || []).forEach(raw => {
    const d = typeof enrichDeal === "function" ? enrichDeal(raw) : raw;
    const types = typeof normalizeRiskTypes === "function" ? normalizeRiskTypes(d) : [];
    if (types.length) {
      const labels = typeof riskLabels === "function" ? riskLabels(types) : types;
      labels.forEach(add);
    } else if (d.riskFlag) {
      add(d.riskFlag);
    }
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function calcDataQuality(deal) {
  if (!deal?.id) return "";
  const { blocks } = evaluatePassportBlocks(deal);
  const allOk = PASSPORT_BLOCKS.every(b => blocks[b.id]);
  return allOk ? "OK" : "Неполный";
}

function renderPassportCompletenessPanel(m, n) {
  const stats = m.passportStats;
  const selected = passportBlockSelection || PASSPORT_BLOCKS.map(b => b.id);
  const complete = stats?.complete ?? (n - (m.passportIncomplete ?? m.incomplete ?? 0));
  const incomplete = stats?.incomplete ?? (m.passportIncomplete ?? m.incomplete ?? 0);
  const pct = stats?.pct != null ? Math.round(stats.pct * 100) : (m.passportCompleteness != null ? Math.round(m.passportCompleteness * 100) : 0);
  const selectedLabel = selected.map(id => PASSPORT_BLOCKS.find(b => b.id === id)?.short || id).join(" + ") || "—";
  const drillAttrs = typeof dashDrill === "function"
    ? dashDrill(buildDealsReportSpec({}, { type: "passportBlocks", value: selected.join("|") }))
    : "";

  return `<div class="card passport-panel" style="margin-bottom:1.5rem">
    <div class="card-header passport-panel-head">
      <span>Полнота паспортов</span>
      <span class="passport-panel-pct">${pct}%</span>
    </div>
    <div class="card-body">
      <p class="muted passport-panel-sub">${complete} из ${n} сделок полностью по выбранным блокам: <strong>${escapeHtml(selectedLabel)}</strong></p>
      <div class="passport-block-filters">
        ${PASSPORT_BLOCKS.map(b => {
          const on = selected.includes(b.id);
          const blockPct = stats?.byBlock?.[b.id];
          const blockLabel = blockPct ? `${Math.round(blockPct.pct * 100)}% (${blockPct.complete}/${blockPct.total})` : "—";
          return `<label class="passport-block-chip" title="${escapeHtml(b.hint)}">
            <input type="checkbox" class="passport-block-cb" value="${b.id}"${on ? " checked" : ""}>
            <span class="passport-block-chip-text">
              <strong>${escapeHtml(b.short)}</strong>
              <span class="muted">${escapeHtml(b.label)} · ${blockLabel}</span>
            </span>
            <button type="button" class="btn btn-sm passport-block-drill-btn" data-passport-block="${b.id}" title="Неполные по блоку">→</button>
          </label>`;
        }).join("")}
      </div>
      <div class="passport-panel-actions">
        <button type="button" class="btn btn-sm dash-drill-row" ${drillAttrs}>Показать неполные (${incomplete}) →</button>
      </div>
    </div>
  </div>`;
}

function renderTopRisksPanel(m) {
  const rows = m.topRisks || [];
  const max = Math.max(1, rows[0]?.count || 1);
  return `<div class="card" style="margin-bottom:1.5rem">
    <div class="card-header">Топ рисков в срезе</div>
    <div class="card-body">
      ${rows.length ? `<div class="funnel">
        ${rows.map(r => {
          const attrs = typeof dashDrill === "function"
            ? dashDrill(buildDealsReportSpec({}, { type: "riskTop", value: r.label }))
            : "";
          return `<div class="funnel-row dash-drill-row" ${attrs} title="Открыть сделки">
            <span class="name">${escapeHtml(r.label)}</span>
            <div class="bar-wrap"><div class="bar" style="width:${(r.count / max) * 100}%;background:#c53030"></div></div>
            <span class="count">${r.count}</span>
          </div>`;
        }).join("")}
      </div>` : `<div class="muted">Нет зафиксированных рисков в текущем срезе</div>`}
    </div>
  </div>`;
}

function renderManagerPassportPanel(m) {
  const rows = m.managerPassport || [];
  const selected = passportBlockSelection || PASSPORT_BLOCKS.map(b => b.id);
  const blockCols = PASSPORT_BLOCKS.map(b => `<th title="${escapeHtml(b.hint)}">${escapeHtml(b.short)}</th>`).join("");
  return `<div class="card" style="margin-bottom:1.5rem">
    <div class="card-header">Менеджеры: полнота паспортов</div>
    <div class="card-body table-wrap">
      <p class="muted" style="font-size:.78rem;margin-bottom:.65rem">
        <strong>Все блоки</strong> — доля сделок, где заполнены все выбранные блоки сразу (${selected.map(id => PASSPORT_BLOCKS.find(b => b.id === id)?.short || id).join(" + ")}).
        <strong>Ср. %</strong> — среднее заполнение по выбранным блокам (понятнее для сравнения менеджеров).
        Клик по строке — сделки менеджера.
      </p>
      <table class="dash-table manager-passport-table">
        <thead><tr>
          <th>Менеджер</th><th>Сделок</th><th title="Все выбранные блоки сразу">Все блоки</th><th title="Среднее по выбранным блокам">Ср. %</th><th>Неполн.</th>${blockCols}
        </tr></thead>
        <tbody>${rows.map(r => {
          const attrs = typeof dashDrill === "function"
            ? dashDrill(buildDealsReportSpec({ owner: [r.owner] }))
            : "";
          const cells = PASSPORT_BLOCKS.map(b => {
            const st = r.byBlock?.[b.id];
            const p = st ? Math.round(st.pct * 100) : 0;
            return `<td class="num${p >= 80 ? " pct-good" : p >= 50 ? "" : " pct-bad"}">${p}%</td>`;
          }).join("");
          const totalPct = Math.round((r.pct || 0) * 100);
          const avgPct = Math.round((r.avgBlockPct || 0) * 100);
          return `<tr class="dash-drill-row" ${attrs}>
            <td>${escapeHtml(r.owner)}</td>
            <td>${r.count}</td>
            <td class="num">${totalPct}%</td>
            <td class="num"><strong>${avgPct}%</strong></td>
            <td>${r.incomplete}</td>${cells}
          </tr>`;
        }).join("") || `<tr><td colspan="${6 + PASSPORT_BLOCKS.length}" class="muted">Нет данных</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}
