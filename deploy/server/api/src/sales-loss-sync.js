"use strict";

const MANAGER_LOSS_REASONS = [
  "Нет бюджета",
  "Выбрали конкурента",
  "Проект заморожен",
  "Нет ЛПР / контакта",
  "Не подошло решение",
  "Сроки не совпали",
  "Другое",
];

const PRE_PILOT_SALES_STAGES = new Set([
  "Взят в работу",
  "Встреча состоялась",
  "Интерес  Выявлен",
  "Предложение выслано",
]);

const PILOT_SALES_STAGES = new Set([
  "Подготовка Пилота",
  "Пилот",
  "Ожидаем отчет по итогам",
  "Пилот Окончен",
]);

const PRESALE_LOSS_DEMO = "Провал после демо (функциональный)";
const PRESALE_LOSS_PRE_PILOT = "Провал до пилота (не функциональный)";

const DISCOVERY_SEGMENT_ID = "discovery";

function isPrePilotSalesStage(stage) {
  return PRE_PILOT_SALES_STAGES.has(String(stage || "").trim());
}

function isPilotSalesStage(stage) {
  return PILOT_SALES_STAGES.has(String(stage || "").trim());
}

function shouldSkipManagerRejectSync(fromStage) {
  const st = String(fromStage || "").trim();
  if (!st || st === "Отказ") return false;
  return isPilotSalesStage(st) || (!isPrePilotSalesStage(st) && st !== "На паузе");
}

function mapSolutionNotFitToPresaleLoss(deal) {
  const segments = Array.isArray(deal?.lossSolutionSegments) ? deal.lossSolutionSegments : [];
  const onlyDiscovery = segments.length === 1 && segments[0] === DISCOVERY_SEGMENT_ID;
  if (onlyDiscovery) return PRESALE_LOSS_DEMO;
  if (segments.includes(DISCOVERY_SEGMENT_ID)) {
    if (deal.lossItmenDiscoveryOnly === true) return PRESALE_LOSS_DEMO;
    if (deal.lossItmenDiscoveryOnly === false) return PRESALE_LOSS_PRE_PILOT;
    return null;
  }
  return PRESALE_LOSS_PRE_PILOT;
}

function mapManagerLossToPresaleReason(deal) {
  const reason = String(deal?.lossReason || "").trim();
  if (!reason) return null;

  if (["Нет бюджета", "Проект заморожен", "Нет ЛПР / контакта", "Сроки не совпали"].includes(reason)) {
    return PRESALE_LOSS_PRE_PILOT;
  }
  if (reason === "Выбрали конкурента") {
    return PRESALE_LOSS_DEMO;
  }
  if (reason === "Не подошло решение") {
    return mapSolutionNotFitToPresaleLoss(deal);
  }
  if (reason === "Другое") {
    return PRESALE_LOSS_PRE_PILOT;
  }
  return null;
}

function buildPresaleLossComment(deal) {
  const parts = [];
  const reason = String(deal?.lossReason || "").trim();
  if (reason === "Выбрали конкурента" && deal.lossCompetitorKey) {
    parts.push(`Конкурент: ${deal.lossCompetitorKey.replace("|||", " — ")}`);
  }
  if (reason === "Не подошло решение" && deal.lossSolutionSegments?.length) {
    parts.push(`Что искали: ${deal.lossSolutionSegments.join(", ")}`);
    if (deal.lossItmenDiscoveryOnly != null) {
      parts.push(`ITMEN как Discovery: ${deal.lossItmenDiscoveryOnly ? "да" : "нет"}`);
    }
  }
  if (reason === "Другое" && deal.lossOtherComment) {
    parts.push(deal.lossOtherComment);
  }
  if (reason) parts.unshift(`Отказ менеджера: ${reason}`);
  return parts.join("\n");
}

async function syncPresaleFromSalesReject(dealId, deal, { savedBy = "manager", fromStage } = {}) {
  if (String(deal?.stage || "").trim() !== "Отказ") return null;
  const prevStage = String(fromStage || "").trim();
  if (shouldSkipManagerRejectSync(prevStage)) {
    return { skipped: true, reason: "post_pilot_or_pilot_stage" };
  }

  const presaleLossReason = mapManagerLossToPresaleReason(deal);
  if (!presaleLossReason) {
    return { skipped: true, reason: "unmapped_or_incomplete_solution" };
  }

  const { patchPresaleDeal, getPresaleForDeal } = require("./presale-data");
  const { loadPipelineState } = require("./mapper");
  const fullDeal = deal?.customer ? deal : await loadPipelineState({ dealId, includeArchived: true });
  const presale = await getPresaleForDeal(dealId, fullDeal);

  if (presale.stage === "Отказ" && presale.lossReason && presale.lossReason === presaleLossReason) {
    return presale;
  }

  const lossComment = buildPresaleLossComment(fullDeal);
  const patch = {
    stage: "Отказ",
    lossReason: presaleLossReason,
    lossComment: lossComment || presale.lossComment || "",
    salesRejectMode: "none",
  };

  return patchPresaleDeal(dealId, patch, {
    savedBy,
    syncSales: false,
    skipKaiten: false,
    deal: fullDeal,
  });
}

module.exports = {
  MANAGER_LOSS_REASONS,
  PRE_PILOT_SALES_STAGES,
  PILOT_SALES_STAGES,
  mapManagerLossToPresaleReason,
  mapSolutionNotFitToPresaleLoss,
  shouldSkipManagerRejectSync,
  buildPresaleLossComment,
  syncPresaleFromSalesReject,
};
