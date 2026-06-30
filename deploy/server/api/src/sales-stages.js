"use strict";

/** Канонические стадии воронки продаж — единственный источник для list_items.stages */
const CANONICAL_SALES_STAGES = [
  "Входящие лиды",
  "Взят в работу",
  "Встреча состоялась",
  "Интерес  Выявлен",
  "Подготовка Пилота",
  "Пилот",
  "Ожидаем отчет по итогам",
  "Пилот Окончен",
  "Провал пилота",
  "Предложение выслано",
  "Согласование бюджета",
  "Финальный компред",
  "Условия согласованы",
  "Документы подписаны",
  "Отгружен",
  "Успешно реализовано",
  "На паузе",
  "Отказ",
];

const KANBAN_VISIBLE_SALES_STAGES = CANONICAL_SALES_STAGES.filter(s => s !== "Отказ");

function normStage(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/ё/g, "е");
}

function isCanonicalSalesStage(name) {
  const n = normStage(name);
  return CANONICAL_SALES_STAGES.some(s => normStage(s) === n);
}

function filterCanonicalSalesStages(names) {
  const out = [];
  const seen = new Set();
  for (const name of names || []) {
    const val = String(name || "").trim();
    if (!val || !isCanonicalSalesStage(val)) continue;
    const key = normStage(val);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(CANONICAL_SALES_STAGES.find(s => normStage(s) === key) || val);
  }
  return out;
}

module.exports = {
  CANONICAL_SALES_STAGES,
  KANBAN_VISIBLE_SALES_STAGES,
  isCanonicalSalesStage,
  filterCanonicalSalesStages,
  normStage,
};
