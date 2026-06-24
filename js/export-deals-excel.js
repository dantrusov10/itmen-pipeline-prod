/* Экспорт воронки (текущий срез фильтров) в Excel */
const EXPORT_HEADERS = [
  "Клиент", "Отрасль", "Стадия", "Ожидаемая сумма", "Ожидаемый бюджет",
  "Партнёр", "Скидка партнёру %", "Скидка клиенту %", "Плановый период бюджета",
  "Статус бюджета", "Месяц согласования", "Год согласования",
  "Что ищут", "As-IS", "Боли смены", "Конкуренты", "Ключевые задачи",
  "% продукта", "% пилота", "Срок задачи",
  "Критический риск", "Комментарий риск", "Общие боли",
  "Лояльность (0-5)", "Статус коммита", "ID", "Владелец", "Балл", "Категория",
];

function serializeSeekingForExport(tr) {
  const labels = Object.fromEntries((window.ITMEN_CONFIG?.techSegments || []).map(s => [s.id, s.label]));
  return (tr?.seekingSegments || []).map(s =>
    s === "other" ? (tr.seekingOtherLabel?.trim() || "Другое") : (labels[s] || s)
  ).join("; ");
}

function serializeAsIsForExport(stack) {
  if (!stack) return "";
  return Object.entries(stack).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
}

function serializePainsForExport(pains) {
  if (!pains) return "";
  return Object.entries(pains).filter(([, v]) => v?.trim()).map(([k, v]) => `${k}: ${v}`).join("; ");
}

function serializeCompetitorsForExport(entries) {
  if (!entries) return "";
  const parts = [];
  Object.entries(entries).forEach(([seg, arr]) => {
    (arr || []).forEach(e => {
      if (!e?.vendor && !e?.product) return;
      parts.push(`${seg}=${[e.vendor, e.product, e.status, e.rejectReason, e.continueReason, e.comment].join("|")}`);
    });
  });
  return parts.join("; ");
}

function dealToExportRow(d) {
  const tr = migrateTechResearch(d.techResearch || {});
  const risks = normalizeRiskTypes(d);
  const riskLabel = risks.length ? riskLabels(risks).join(", ") : "";
  return [
    d.customer || "",
    d.industry || "",
    d.stage || "",
    d.amount ?? "",
    d.expectedBudget ?? "",
    d.partner || "",
    d.partnerDiscount ?? "",
    d.clientDiscount ?? "",
    d.budgetPeriod || "",
    d.budgetStatus || "",
    d.budgetPlannedMonth ?? "",
    d.budgetPlannedYear ?? "",
    serializeSeekingForExport(tr),
    serializeAsIsForExport(tr.asIsStack),
    serializePainsForExport(tr.changePains),
    serializeCompetitorsForExport(tr.competitorEntries),
    (tr.projectTasks || []).join("\n"),
    tr.productRequirementsPct ?? "",
    tr.pilotRequirementsPct ?? "",
    d.taskDue || "",
    riskLabel,
    d.riskComment || "",
    d.pains || "",
    d.scores?.loyalty > 0 ? d.scores.loyalty : "",
    d.commitLabel || commitLabel(d.commitStatus),
    d.id || "",
    d.owner || "",
    d.score ?? "",
    d.category || "",
  ];
}

function getDealsExportRows() {
  if (typeof applyDealsTableFilters === "function" && typeof getEnrichedDeals === "function") {
    return applyDealsTableFilters(getEnrichedDeals());
  }
  return (state?.deals || []).map(enrichDeal);
}

function exportDealsToExcel() {
  if (typeof XLSX === "undefined") {
    alert("Библиотека Excel ещё загружается. Повторите через несколько секунд.");
    return;
  }
  const rows = getDealsExportRows();
  if (!rows.length) {
    alert("Нет сделок для экспорта в текущем срезе.");
    return;
  }
  const data = [EXPORT_HEADERS, ...rows.map(dealToExportRow)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Воронка");
  const suffix = new Date().toISOString().slice(0, 10);
  const filtered = typeof dealsTableColFilters !== "undefined" &&
    (Object.keys(dealsTableColFilters).length || dealsTableSearch || dealsTablePreset);
  XLSX.writeFile(wb, `ITMen_воронка${filtered ? "_срез" : ""}_${suffix}.xlsx`);
  if (typeof showToast === "function") {
    showToast(`Экспортировано ${rows.length} сделок`);
  }
}
