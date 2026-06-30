"use strict";

const { listAll } = require("./pb-client");
const { listAdminOwners } = require("./users");
const { formatDateMsk } = require("./metrics");

function periodDays(period) {
  if (period === "day") return 1;
  if (period === "month") return 30;
  if (period === "quarter") return 90;
  return 7;
}

function resolveRange(period, opts = {}, now = new Date()) {
  if (period === "custom" && opts.from && opts.to) {
    return {
      from: new Date(String(opts.from).slice(0, 10)),
      to: new Date(`${String(opts.to).slice(0, 10)}T23:59:59.999+03:00`),
      fromStr: String(opts.from).slice(0, 10),
      toStr: String(opts.to).slice(0, 10),
    };
  }
  const days = periodDays(period);
  const from = new Date(now.getTime() - days * 86400000);
  return {
    from,
    to: now,
    fromStr: formatDateMsk(from),
    toStr: formatDateMsk(now),
  };
}

function inRange(iso, from, to) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function taskCreatedAt(row) {
  return row.created_at || row.created || "";
}

function msToDurationParts(ms) {
  if (!Number.isFinite(ms) || ms < 0) return { days: 0, hours: 0, label: "—" };
  const totalHours = Math.round(ms / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [];
  if (days) parts.push(`${days} д`);
  if (hours || !days) parts.push(`${hours} ч`);
  return { days, hours, label: parts.join(" ") };
}

const { parseMskDateTime } = require("./msk-datetime");

async function buildTaskMetrics(period = "month", opts = {}) {
  const now = new Date();
  const range = resolveRange(period, opts, now);
  const adminOwners = await listAdminOwners();
  const adminSet = new Set(adminOwners);
  const ownerFilter = opts.owner
    ? String(opts.owner).split(",").map(s => s.trim()).filter(Boolean)
    : [];

  const [taskRows, dealRows] = await Promise.all([
    listAll("deal_tasks"),
    listAll("deals", { filter: "archived=false", fields: "id,deal_id,stage,owner" }),
  ]);

  const dealMap = Object.fromEntries(dealRows.map(d => [d.id, d]));
  const sliceDeals = dealRows.filter(d => {
    if (adminSet.has(d.owner || "")) return false;
    if (ownerFilter.length && !ownerFilter.includes(d.owner || "")) return false;
    return true;
  });

  const tasksInPeriod = taskRows.filter(r => {
    const deal = dealMap[r.deal];
    if (!deal || adminSet.has(deal.owner || "")) return false;
    if (ownerFilter.length && !ownerFilter.includes(deal.owner || "")) return false;
    const created = taskCreatedAt(r);
    return inRange(created, range.from, range.to);
  });

  let doneInPeriod = 0;
  let onTime = 0;
  let overdueDone = 0;
  let openOverdue = 0;
  let completionMsSum = 0;
  let completionCount = 0;
  const byDay = {};

  for (const r of taskRows) {
    const deal = dealMap[r.deal];
    if (!deal || adminSet.has(deal.owner || "")) continue;
    if (ownerFilter.length && !ownerFilter.includes(deal.owner || "")) continue;
    const created = taskCreatedAt(r);
    const due = r.due_at ? parseMskDateTime(r.due_at)?.getTime() : null;
    const done = r.done_at ? new Date(r.done_at).getTime() : null;
    const status = r.status || "open";

    if (inRange(created, range.from, range.to)) {
      const day = String(created).slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }

    if (status === "done" && done && inRange(r.done_at, range.from, range.to)) {
      doneInPeriod += 1;
      if (due && done <= due) onTime += 1;
      else if (due && done > due) overdueDone += 1;
      else onTime += 1;
      const createdMs = created ? new Date(created).getTime() : null;
      if (createdMs && done > createdMs) {
        completionMsSum += done - createdMs;
        completionCount += 1;
      }
    } else if (status !== "done" && due && due < now.getTime()) {
      if (inRange(created, range.from, range.to) || (due && inRange(new Date(due).toISOString(), range.from, range.to))) {
        openOverdue += 1;
      }
    }
  }

  const createdCount = tasksInPeriod.length;
  const closedBase = doneInPeriod || 1;
  const overdueTotal = overdueDone + openOverdue;
  const overdueBase = createdCount || 1;

  const stages = new Set(sliceDeals.map(d => d.stage).filter(Boolean));
  const dealsWithTasks = new Set(tasksInPeriod.map(r => r.deal));
  const avgPerDeal = dealsWithTasks.size ? Math.round((createdCount / dealsWithTasks.size) * 10) / 10 : 0;
  const avgPerStage = stages.size ? Math.round((createdCount / stages.size) * 10) / 10 : 0;

  const avgCompletion = completionCount
    ? msToDurationParts(completionMsSum / completionCount)
    : { days: 0, hours: 0, label: "—" };

  const trend = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    ok: true,
    period,
    from: range.fromStr,
    to: range.toStr,
    summary: {
      taskCount: createdCount,
      doneCount: doneInPeriod,
      onTimePct: doneInPeriod ? Math.round((onTime / closedBase) * 100) : null,
      overduePct: createdCount ? Math.round((overdueTotal / overdueBase) * 100) : null,
      avgPerDeal,
      avgPerStage,
      avgCompletionMs: completionCount ? Math.round(completionMsSum / completionCount) : null,
      avgCompletionLabel: avgCompletion.label,
      openOverdue,
    },
    trend,
    dealCount: sliceDeals.length,
    stageCount: stages.size,
  };
}

module.exports = { buildTaskMetrics };
