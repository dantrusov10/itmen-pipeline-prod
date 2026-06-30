"use strict";

const { listAll } = require("./pb-client");
const { feasibilityScore } = require("./requirements");

function normText(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function rowScore(row) {
  if (row.feasibility_score != null && !Number.isNaN(Number(row.feasibility_score))) {
    return Number(row.feasibility_score);
  }
  return feasibilityScore(row.feasibility);
}

function pilotReqText(row) {
  return normText(row.client_requirement || row.business_need || "");
}

function productReqText(row) {
  return normText(row.functional_requirement || row.business_requirement || "");
}

function topByClients(rows, dealMap, textFn, limit = 5) {
  const byDeal = new Map();
  for (const row of rows) {
    const text = textFn(row);
    if (!text) continue;
    const deal = dealMap[row.deal];
    if (!deal) continue;
    const score = rowScore(row);
    if (score == null) continue;
    if (!byDeal.has(row.deal)) byDeal.set(row.deal, []);
    byDeal.get(row.deal).push({
      text,
      score,
      pct: Math.round(score * 100),
      feasibility: row.feasibility || "—",
      reqType: row.req_type || "",
      mandatory: Boolean(row.is_mandatory),
    });
  }
  const out = [];
  for (const [pbId, reqs] of byDeal.entries()) {
    const deal = dealMap[pbId];
    reqs.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, "ru"));
    const scores = reqs.map(r => r.score);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    let latestAt = "";
    for (const row of rows.filter(r => r.deal === pbId)) {
      const at = String(row.updated || row.created || "").trim();
      if (at && (!latestAt || at > latestAt)) latestAt = at;
    }
    out.push({
      dealId: deal.dealId,
      customer: deal.customer || deal.dealId,
      top: reqs.slice(0, limit).map(r => ({ ...r, reqKey: r.text.toLowerCase() })),
      count: reqs.length,
      avgPct: Math.round(avgScore * 100),
      latestAt,
    });
  }
  return out.sort((a, b) => (b.top[0]?.score || 0) - (a.top[0]?.score || 0) || a.customer.localeCompare(b.customer, "ru"));
}

function topOverall(rows, dealMap, textFn, limit = 15) {
  const agg = new Map();
  for (const row of rows) {
    const text = textFn(row);
    if (!text) continue;
    const deal = dealMap[row.deal];
    if (!deal) continue;
    const score = rowScore(row);
    if (score == null) continue;
    const key = text.toLowerCase();
    if (!agg.has(key)) {
      agg.set(key, { text, scores: [], dealIds: new Set(), mandatory: 0, reqKey: key });
    }
    const item = agg.get(key);
    item.scores.push(score);
    item.dealIds.add(deal.dealId);
    if (row.is_mandatory) item.mandatory += 1;
  }
  return [...agg.values()]
    .map(item => ({
      text: item.text,
      reqKey: item.reqKey || item.text.toLowerCase(),
      dealCount: item.dealIds.size,
      dealIds: [...item.dealIds],
      avgScore: item.scores.reduce((a, b) => a + b, 0) / item.scores.length,
      avgPct: Math.round((item.scores.reduce((a, b) => a + b, 0) / item.scores.length) * 100),
      mandatory: item.mandatory,
      rowCount: item.scores.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore || b.dealCount - a.dealCount || a.text.localeCompare(b.text, "ru"))
    .slice(0, limit);
}

async function buildRequirementsSummary(dealIds = null) {
  const deals = await listAll("deals", {
    filter: 'archived=false',
    fields: "id,deal_id,customer,stage",
  });
  const allowed = dealIds?.length ? new Set(dealIds.map(String)) : null;
  const dealMap = {};
  for (const d of deals) {
    if (allowed && !allowed.has(String(d.deal_id))) continue;
    dealMap[d.id] = { dealId: d.deal_id, customer: d.customer || d.deal_id };
  }
  const pbIds = Object.keys(dealMap);
  if (!pbIds.length) {
    return {
      pilotByClients: [],
      productByClients: [],
      pilotTopOverall: [],
      productTopOverall: [],
      dealCount: 0,
    };
  }

  const [pilotRows, productRows] = await Promise.all([
    listAll("pilot_requirements", { sort: "-feasibility_score,created" }),
    listAll("product_requirements", { sort: "-feasibility_score,created" }),
  ]);
  const pilotFiltered = pilotRows.filter(r => dealMap[r.deal]);
  const productFiltered = productRows.filter(r => dealMap[r.deal]);

  return {
    pilotByClients: topByClients(pilotFiltered, dealMap, pilotReqText),
    productByClients: topByClients(productFiltered, dealMap, productReqText),
    pilotTopOverall: topOverall(pilotFiltered, dealMap, pilotReqText),
    productTopOverall: topOverall(productFiltered, dealMap, productReqText),
    dealCount: pbIds.length,
  };
}

module.exports = { buildRequirementsSummary };
