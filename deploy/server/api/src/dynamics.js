"use strict";

const { listAll } = require("./pb-client");
const { loadPipelineState } = require("./mapper");
const { calcDealScore, calcCategory, isWeightedDeal, formatDateMsk } = require("./metrics");
const { listAdminOwners } = require("./users");
const { buildScoreImpactMap } = require("./score-engine");

function periodDays(period) {
  if (period === "day") return 1;
  if (period === "month") return 30;
  if (period === "quarter") return 90;
  return 7;
}

function resolvePeriodRange(period, opts = {}, now = new Date()) {
  let from;
  let to = now;
  let fromStr;
  let toStr;
  if (period === "custom" && opts.from && opts.to) {
    fromStr = String(opts.from).slice(0, 10);
    toStr = String(opts.to).slice(0, 10);
    from = new Date(fromStr);
    to = endOfDayMsk(toStr);
  } else {
    const days = periodDays(period);
    from = new Date(now.getTime() - days * 86400000);
    fromStr = formatDateMsk(from);
    toStr = formatDateMsk(now);
  }
  return { from, to, fromStr, toStr, period };
}

function truncateAuditVal(raw, max = 120) {
  if (raw == null || raw === "") return "—";
  const s = String(raw).trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function buildDealScoreChanges(auditRows, dealId, from, to, impactById) {
  return (auditRows || [])
    .filter(r => r.deal_id === dealId && inPeriod(r.at, from, to))
    .map(r => ({
      at: r.at,
      label: r.label || "Изменение",
      oldValue: truncateAuditVal(r.old_value),
      newValue: truncateAuditVal(r.new_value),
      impact: impactById[r.id] || null,
      by: r.user || r.saved_by || "—",
    }))
    .filter(r => r.impact && r.impact !== "0")
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 20);
}

function endOfDayMsk(dateStr) {
  return new Date(`${String(dateStr).slice(0, 10)}T23:59:59.999+03:00`);
}

function inPeriod(at, from, to) {
  if (!at) return false;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return false;
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

function parseAuditMoney(val) {
  if (val == null || val === "") return null;
  const s = String(val).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function buildAmountDeltasFromAudit(auditRows, from, to, label) {
  const byDeal = new Map();
  for (const row of auditRows || []) {
    if (!inPeriod(row.at, from, to)) continue;
    if (row.label !== label) continue;
    const dealId = row.deal_id || "";
    if (!dealId) continue;
    const was = parseAuditMoney(row.old_value);
    const now = parseAuditMoney(row.new_value);
    if (was === now) continue;
    byDeal.set(dealId, {
      dealId,
      customer: row.customer || "",
      owner: row.owner || "",
      was: was ?? 0,
      now: now ?? 0,
      delta: (now ?? 0) - (was ?? 0),
    });
  }
  return [...byDeal.values()];
}

function mergeDeltaLists(primary, secondary) {
  const map = new Map((primary || []).map(r => [r.dealId, r]));
  for (const r of secondary || []) {
    if (!map.has(r.dealId)) map.set(r.dealId, r);
  }
  return [...map.values()];
}

function buildPeriodDealChanges(auditRows, activityRows, dealByPbId, from, to) {
  const byId = new Map();
  const add = (dealId, meta, kind) => {
    if (!dealId) return;
    byId.set(dealId, {
      dealId,
      customer: meta.customer || "",
      owner: meta.owner || "",
      kind,
    });
  };
  for (const row of auditRows || []) {
    if (!inPeriod(row.at, from, to)) continue;
    const dealId = row.deal_id || "";
    if (!dealId) continue;
    if (row.is_new_deal) {
      add(dealId, row, "added");
      continue;
    }
    if (row.label === "Стадия") {
      const nv = String(row.new_value || "").trim();
      const ov = String(row.old_value || "").trim();
      if (nv === "Отказ" && ov !== "Отказ") add(dealId, row, "rejected");
    }
  }
  for (const row of activityRows || []) {
    const at = row.activity_at || row.created;
    if (!inPeriod(at, from, to)) continue;
    const dm = dealByPbId[row.deal];
    const dealId = dm?.deal_id || "";
    if (!dealId) continue;
    if (row.activity_type === "archive") add(dealId, dm, "archived");
    if (row.activity_type === "loss_reason" || row.activity_type === "stage_change") {
      const body = String(row.body || "");
      if (body.includes("Отказ") || row.activity_type === "loss_reason") add(dealId, dm, "rejected");
    }
  }
  return [...byId.values()];
}

function parseAuditScore(raw) {
  try {
    const sc = typeof raw === "string" ? JSON.parse(raw) : raw;
    return calcDealScore(sc);
  } catch {
    return null;
  }
}

function buildAuditScoreTimeline(rows) {
  const timeline = {};
  for (const row of rows) {
    if (row.label !== "Скоринг") continue;
    const dealId = row.deal_id || "";
    if (!dealId) continue;
    const when = row.at ? new Date(row.at) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    const score = parseAuditScore(row.new_value);
    if (score == null) continue;
    if (!timeline[dealId]) timeline[dealId] = [];
    timeline[dealId].push({
      when,
      score,
      customer: row.customer || "",
      owner: row.owner || "",
    });
  }
  for (const id of Object.keys(timeline)) {
    timeline[id].sort((a, b) => a.when - b.when);
  }
  return timeline;
}

function scoreAtOrBefore(timeline, dealId, cutoff) {
  const entries = timeline[dealId];
  if (!entries?.length) return null;
  let found = null;
  for (const e of entries) {
    if (e.when <= cutoff) found = e;
    else break;
  }
  return found;
}

async function readSnapshotDailySince(fromDateStr) {
  const rows = await listAll("snapshots_daily", { sort: "date" });
  return rows
    .filter(r => String(r.date) >= fromDateStr)
    .map(r => ({
      date: String(r.date),
      ts: r.ts,
      dealCount: r.deal_count || 0,
      totalPipeline: r.total_pipeline || 0,
      weightedPipeline: r.weighted_pipeline || 0,
      hotCount: r.hot_count || 0,
      warmCount: r.warm_count || 0,
      avgScore: r.avg_score || 0,
    }));
}

async function readDealSnapshotsForDate(dateStr) {
  const rows = await listAll("snapshots_deals", { filter: `date="${dateStr}"` });
  const map = {};
  for (const r of rows) {
    map[r.deal_id] = {
      dealId: r.deal_id,
      customer: r.customer || "",
      owner: r.owner || "",
      score: r.score || 0,
      amount: r.amount || 0,
      category: r.category || "",
    };
  }
  return map;
}

function defaultDashboardDeal(d, adminSet) {
  if ((d.stage || "") === "Отказ") return false;
  if (["Успешно реализовано", "Отгружен"].includes(d.stage || "")) return false;
  if (adminSet.size && adminSet.has(d.owner || "")) return false;
  return true;
}

async function getDynamics(period = "week", opts = {}) {
  const now = new Date();
  const mainRange = resolvePeriodRange(period, opts, now);
  const { from, to, fromStr, toStr } = mainRange;
  const trendPeriod = String(opts.trendPeriod || period || "week");
  const trendRange = resolvePeriodRange(
    trendPeriod,
    {
      from: opts.trendFrom || opts.from,
      to: opts.trendTo || opts.to,
    },
    now,
  );

  const [state, daily, trendDaily, auditRows, activityRows, dealRows, adminOwners] = await Promise.all([
    loadPipelineState({ lite: false }),
    readSnapshotDailySince(fromStr),
    trendRange.fromStr === fromStr
      ? null
      : readSnapshotDailySince(trendRange.fromStr),
    listAll("audit_log"),
    listAll("deal_activities", { sort: "-activity_at", perPage: 3000 }),
    listAll("deals", { fields: "id,deal_id,customer,owner" }),
    listAdminOwners(),
  ]);
  const dailyForTrend = trendDaily || daily;
  const dealByPbId = Object.fromEntries((dealRows || []).map(d => [d.id, d]));
  const adminSet = new Set(adminOwners);
  const sliceDeals = (state.deals || []).filter(d => d && defaultDashboardDeal(d, adminSet));

  const baselineDate = daily.length ? daily[0].date : null;
  const baselineDeals = baselineDate ? await readDealSnapshotsForDate(baselineDate) : {};

  const auditTimeline = buildAuditScoreTimeline(auditRows);
  const scoreImpactByAuditId = buildScoreImpactMap(auditRows);

  const deltas = [];
  const pipelineAmountDeltas = [];
  const weightedAmountDeltas = [];
  const dealCountChanges = [];
  const curIdSet = new Set();
  for (const d of sliceDeals) {
    if (!d?.id) continue;
    curIdSet.add(d.id);
    const curAmount = Number(d.amount) || 0;
    const base = baselineDeals[d.id];
    const baseAmount = base != null ? (Number(base.amount) || 0) : null;
    if (baseAmount != null) {
      const amountDelta = curAmount - baseAmount;
      if (amountDelta !== 0) {
        pipelineAmountDeltas.push({
          dealId: d.id,
          customer: d.customer || base.customer || "",
          owner: d.owner || base.owner || "",
          was: baseAmount,
          now: curAmount,
          delta: amountDelta,
        });
      }
    } else if (curAmount > 0) {
      pipelineAmountDeltas.push({
        dealId: d.id,
        customer: d.customer || "",
        owner: d.owner || "",
        was: 0,
        now: curAmount,
        delta: curAmount,
      });
    }

    const curScore = calcDealScore(d.scores, d.manualProb);
    const category = calcCategory(curScore, d.commitStatus, d.budgetStatus);
    const curWeighted = isWeightedDeal(curScore, category) ? curAmount : 0;
    const baseWeighted = base && isWeightedDeal(base.score, base.category) ? (Number(base.amount) || 0) : 0;
    const weightedDelta = curWeighted - baseWeighted;
    if (weightedDelta !== 0) {
      weightedAmountDeltas.push({
        dealId: d.id,
        customer: d.customer || base?.customer || "",
        owner: d.owner || base?.owner || "",
        was: baseWeighted,
        now: curWeighted,
        delta: weightedDelta,
      });
    }

    if (!base) {
      dealCountChanges.push({
        dealId: d.id,
        customer: d.customer || "",
        owner: d.owner || "",
        kind: "added",
      });
    }

    if (curScore == null) continue;
    let baseScore = base ? base.score : null;
    let meta = base || {};
    if (baseScore == null) {
      const auditBase = scoreAtOrBefore(auditTimeline, d.id, from);
      if (auditBase) {
        baseScore = auditBase.score;
        meta = auditBase;
      }
    }
    if (baseScore == null) continue;
    const delta = curScore - baseScore;
    if (delta === 0) continue;
    deltas.push({
      dealId: d.id,
      customer: d.customer || meta.customer || "",
      owner: d.owner || meta.owner || "",
      was: baseScore,
      now: curScore,
      delta,
      amount: curAmount,
      scoreChanges: buildDealScoreChanges(auditRows, d.id, from, to, scoreImpactByAuditId),
    });
  }

  deltas.sort((a, b) => b.delta - a.delta);
  const auditPipelineDeltas = buildAmountDeltasFromAudit(auditRows, from, to, "Ожид. сумма");
  const pipelineAmountDeltasMerged = mergeDeltaLists(pipelineAmountDeltas, auditPipelineDeltas)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  weightedAmountDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const id of Object.keys(baselineDeals)) {
    if (!curIdSet.has(id)) {
      const b = baselineDeals[id];
      dealCountChanges.push({
        dealId: id,
        customer: b.customer || "",
        owner: b.owner || "",
        kind: "removed",
      });
    }
  }

  const periodDealChanges = buildPeriodDealChanges(auditRows, activityRows, dealByPbId, from, to);
  const dealCountChangesMerged = periodDealChanges.length
    ? periodDealChanges
    : dealCountChanges;
  const gains = deltas.filter(d => d.delta > 0).slice(0, 10);
  const losses = deltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10);

  const curTotals = { dealCount: 0, totalPipeline: 0, weightedPipeline: 0, avgScore: 0, hotCount: 0 };
  let scSum = 0;
  let scN = 0;
  for (const d of sliceDeals) {
    if (!d) continue;
    curTotals.dealCount += 1;
    const amount = Number(d.amount) || 0;
    const score = calcDealScore(d.scores, d.manualProb) || 0;
    const category = calcCategory(score, d.commitStatus, d.budgetStatus);
    curTotals.totalPipeline += amount;
    if (isWeightedDeal(score, category)) curTotals.weightedPipeline += amount;
    if (category === "Горячая") curTotals.hotCount += 1;
    if (score > 0) { scSum += score; scN += 1; }
  }
  curTotals.avgScore = scN ? Math.round(scSum / scN) : 0;

  const first = daily[0] || null;
  const last = daily.length ? daily[daily.length - 1] : null;
  const summary = {
    pipelineDelta: last ? curTotals.totalPipeline - last.totalPipeline : (first ? curTotals.totalPipeline - first.totalPipeline : 0),
    weightedDelta: last ? curTotals.weightedPipeline - last.weightedPipeline : (first ? curTotals.weightedPipeline - first.weightedPipeline : 0),
    avgScoreDelta: last ? curTotals.avgScore - last.avgScore : (first ? curTotals.avgScore - first.avgScore : 0),
    dealCountDelta: periodDealChanges.length
      ? new Set(periodDealChanges.map(r => r.dealId)).size
      : (last ? curTotals.dealCount - last.dealCount : (first ? curTotals.dealCount - first.dealCount : 0)),
    baselineDate,
    snapshotDays: daily.length,
  };

  const trend = [...dailyForTrend];
  trend.push({
    date: formatDateMsk(now),
    dealCount: curTotals.dealCount,
    totalPipeline: curTotals.totalPipeline,
    weightedPipeline: curTotals.weightedPipeline,
    hotCount: curTotals.hotCount,
    warmCount: 0,
    avgScore: curTotals.avgScore,
    live: true,
  });

  const allSnaps = await readSnapshotDailySince("2000-01-01");

  return {
    ok: true,
    period,
    days: periodDays(period === "custom" ? "week" : period),
    from: fromStr,
    to: toStr,
    trendPeriod,
    trendFrom: trendRange.fromStr,
    trendTo: trendRange.toStr,
    pipelineTrend: trend,
    summary,
    topGains: gains,
    topLosses: losses,
    pipelineAmountDeltas: pipelineAmountDeltasMerged,
    weightedAmountDeltas,
    dealCountChanges: dealCountChangesMerged,
    periodDealChanges,
    scoreDeltaDealIds: deltas.map(d => d.dealId),
    hasSnapshots: allSnaps.length > 0,
    snapshotDays: daily.length,
  };
}

module.exports = { getDynamics };
