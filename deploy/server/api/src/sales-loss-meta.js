"use strict";

const { findOne, updateRecord, createRecord } = require("./pb-client");

const META_SLUG = "sales_loss_extra";

async function loadSalesLossMetaMap() {
  try {
    const row = await findOne("pipeline_meta", `slug="${META_SLUG}"`);
    if (!row?.focus_risk) return {};
    const data = typeof row.focus_risk === "string" ? JSON.parse(row.focus_risk) : row.focus_risk;
    return data && typeof data === "object" ? data : {};
  } catch (_) {
    return {};
  }
}

async function saveSalesLossMetaMap(map) {
  const body = {
    slug: META_SLUG,
    focus_risk: JSON.stringify(map || {}),
    next_id: 0,
    data_epoch: 0,
  };
  const existing = await findOne("pipeline_meta", `slug="${META_SLUG}"`);
  if (existing?.id) {
    await updateRecord("pipeline_meta", existing.id, body);
  } else {
    await createRecord("pipeline_meta", body);
  }
}

function normalizeSalesLossExtra(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    lossCompetitorKey: String(o.lossCompetitorKey || "").trim(),
    lossSolutionSegments: Array.isArray(o.lossSolutionSegments) ? o.lossSolutionSegments.map(String) : [],
    lossItmenDiscoveryOnly: o.lossItmenDiscoveryOnly === true ? true : (o.lossItmenDiscoveryOnly === false ? false : null),
    lossOtherComment: String(o.lossOtherComment || "").trim(),
  };
}

async function getSalesLossExtra(dealId) {
  const map = await loadSalesLossMetaMap();
  return normalizeSalesLossExtra(map[dealId]);
}

async function setSalesLossExtra(dealId, extra) {
  const map = await loadSalesLossMetaMap();
  map[dealId] = normalizeSalesLossExtra(extra);
  await saveSalesLossMetaMap(map);
  return map[dealId];
}

function mergeSalesLossExtraIntoDeal(deal, map) {
  if (!deal?.id) return deal;
  const extra = normalizeSalesLossExtra(map?.[deal.id]);
  return {
    ...deal,
    lossCompetitorKey: extra.lossCompetitorKey,
    lossSolutionSegments: extra.lossSolutionSegments,
    lossItmenDiscoveryOnly: extra.lossItmenDiscoveryOnly,
    lossOtherComment: extra.lossOtherComment,
  };
}

module.exports = {
  loadSalesLossMetaMap,
  mergeSalesLossExtraIntoDeal,
  getSalesLossExtra,
  setSalesLossExtra,
  normalizeSalesLossExtra,
};
