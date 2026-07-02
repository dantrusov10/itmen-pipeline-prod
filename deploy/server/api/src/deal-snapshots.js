"use strict";

const { listAll, createRecord, deleteRecord } = require("./pb-client");
const { scoreSum } = require("./deal-merge");

const MAX_SNAPSHOTS_PER_DEAL = 40;

function serializeDealState(deal) {
  if (!deal) return {};
  return {
    id: deal.id,
    customer: deal.customer,
    owner: deal.owner,
    stage: deal.stage,
    amount: deal.amount,
    expectedBudget: deal.expectedBudget,
    manualProb: deal.manualProb,
    budgetStatus: deal.budgetStatus,
    budgetPeriod: deal.budgetPeriod,
    budgetPlannedMonth: deal.budgetPlannedMonth,
    budgetPlannedYear: deal.budgetPlannedYear,
    commitStatus: deal.commitStatus,
    pains: deal.pains,
    riskTypes: deal.riskTypes,
    riskComment: deal.riskComment,
    scores: deal.scores,
    scoreReasons: deal.scoreReasons,
    scoresOverridden: deal.scoresOverridden,
    techResearch: deal.techResearch,
    partner: deal.partner,
    industry: deal.industry,
    amoId: deal.amoId,
    taskDue: deal.taskDue,
  };
}

async function pruneDealSnapshots(dealId) {
  const rows = await listAll("deal_snapshots", {
    filter: `deal_id="${String(dealId).replace(/"/g, '\\"')}"`,
    sort: "-at",
  });
  for (const row of rows.slice(MAX_SNAPSHOTS_PER_DEAL)) {
    try {
      await deleteRecord("deal_snapshots", row.id);
    } catch (e) {
      console.warn("pruneDealSnapshots", dealId, e.message);
    }
  }
}

/**
 * Полный снимок сделки перед записью — для отката при потере данных.
 */
async function snapshotDealBeforeSave(dealId, oldDeal, { savedBy = "system", source = "save" } = {}) {
  if (!dealId || !oldDeal) return null;
  try {
    const state = serializeDealState(oldDeal);
    const row = await createRecord("deal_snapshots", {
      at: new Date().toISOString(),
      deal_id: dealId,
      saved_by: savedBy,
      source: source || savedBy,
      score_sum: scoreSum(state.scores),
      state_json: JSON.stringify(state),
    });
    await pruneDealSnapshots(dealId);
    return row;
  } catch (e) {
    console.warn("snapshotDealBeforeSave", dealId, e.message);
    return null;
  }
}

async function logDataLossAlerts(dealId, oldDeal, newDeal, alerts, { savedBy, source }) {
  if (!alerts?.length) return;
  const { createRecord: create } = require("./pb-client");
  const { sendEmailNotification } = require("./mailer");
  const at = new Date().toISOString();
  const alertSummary = alerts.map(a => a.kind).join(", ");
  for (const a of alerts) {
    await create("audit_log", {
      at,
      saved_by: savedBy || source || "system",
      deal_id: dealId,
      customer: newDeal?.customer || oldDeal?.customer || "",
      owner: newDeal?.owner || oldDeal?.owner || "",
      change_count: alerts.length,
      label: "Потеря данных",
      old_value: JSON.stringify({ alert: a, source, scores: oldDeal?.scores }),
      new_value: JSON.stringify({ scores: newDeal?.scores, segments: newDeal?.techResearch?.seekingSegments }),
      is_new_deal: false,
    });
    console.warn(`[DATA_LOSS] ${dealId} ${a.kind} source=${source} by=${savedBy}`);
  }
  const emails = String(
    process.env.DATA_LOSS_ALERT_EMAILS || "danila.trusov@softline.com,dantrusov10@yandex.ru",
  ).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const msg = [
    `Сделка: ${dealId} (${newDeal?.customer || oldDeal?.customer || ""})`,
    `Тип: ${alertSummary}`,
    `Кто: ${savedBy || source || "system"}`,
    `Было score sum: ${scoreSum(oldDeal?.scores)}`,
    `Стало score sum: ${scoreSum(newDeal?.scores)}`,
  ].join("\n");
  for (const to of emails) {
    sendEmailNotification(to, {
      title: `[ITMen DATA_LOSS] ${dealId}`,
      message: msg,
      link: `https://itmen-pipeline.nwlvl.ru/#deal/${dealId}`,
    }).catch(e => console.warn("DATA_LOSS email", to, e.message));
  }
}

async function loadLatestSnapshot(dealId, beforeIso = null) {
  let filter = `deal_id="${String(dealId).replace(/"/g, '\\"')}"`;
  if (beforeIso) filter += ` && at < "${beforeIso}"`;
  const rows = await listAll("deal_snapshots", { filter, sort: "-at", perPage: 1 });
  const row = rows[0];
  if (!row?.state_json) return null;
  try {
    return { ...row, state: JSON.parse(row.state_json) };
  } catch {
    return null;
  }
}

module.exports = {
  snapshotDealBeforeSave,
  logDataLossAlerts,
  loadLatestSnapshot,
  serializeDealState,
  MAX_SNAPSHOTS_PER_DEAL,
};
