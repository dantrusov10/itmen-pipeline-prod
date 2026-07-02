"use strict";

const SCORE_KEYS = [
  "loyalty", "commit", "budget", "fit", "timing", "competitive", "access", "technical", "commercial",
];

function scoreSum(scores) {
  return Object.values(scores || {}).reduce((s, v) => s + (Number(v) || 0), 0);
}

function hasScores(scores) {
  return scoreSum(scores) > 0;
}

function isEmptyScalar(v) {
  return v == null || v === "";
}

function mergeTechResearch(existing, incoming) {
  const ex = existing || {};
  const inc = incoming || {};
  const out = { ...ex, ...inc };
  for (const key of ["asIsStack", "changePains", "competitorEntries"]) {
    const e = ex[key] || {};
    const i = inc[key] || {};
    if (!Object.keys(i).length) {
      out[key] = e;
      continue;
    }
    out[key] = { ...e };
    for (const [seg, val] of Object.entries(i)) {
      if (val == null || val === "") continue;
      if (typeof val === "object" && !Array.isArray(val)) {
        const has = Object.values(val).some(x => x != null && x !== "");
        if (has) out[key][seg] = val;
      } else if (Array.isArray(val) ? val.length : String(val).trim()) {
        out[key][seg] = val;
      }
    }
  }
  if (!inc.seekingSegments?.length && ex.seekingSegments?.length) {
    out.seekingSegments = ex.seekingSegments;
  }
  if (!inc.projectTasks?.length && ex.projectTasks?.length) {
    out.projectTasks = ex.projectTasks;
  }
  if (isEmptyScalar(inc.seekingOtherLabel) && ex.seekingOtherLabel) {
    out.seekingOtherLabel = ex.seekingOtherLabel;
  }
  if ((inc.productRequirementsPct == null || inc.productRequirementsPct === "")
    && ex.productRequirementsPct != null) {
    out.productRequirementsPct = ex.productRequirementsPct;
  }
  if ((inc.pilotRequirementsPct == null || inc.pilotRequirementsPct === "")
    && ex.pilotRequirementsPct != null) {
    out.pilotRequirementsPct = ex.pilotRequirementsPct;
  }
  return out;
}

/** Не даём частичному сохранению затереть паспорт и скоринг. */
function mergeDealPreserveChildren(existing, incoming) {
  if (!existing) return incoming;
  const out = { ...existing, ...incoming, id: existing.id };

  if (!hasScores(incoming?.scores) && hasScores(existing.scores)) {
    out.scores = existing.scores;
    out.scoreReasons = existing.scoreReasons || {};
    out.scoresOverridden = existing.scoresOverridden || {};
    out.scoreHistory = existing.scoreHistory || [];
  }

  out.techResearch = mergeTechResearch(existing.techResearch, incoming.techResearch);

  if (!incoming.riskTypes?.length && existing.riskTypes?.length) {
    out.riskTypes = existing.riskTypes;
  }

  const preserveIfEmpty = [
    "owner", "pains", "riskComment", "commitStatus", "budgetStatus", "budgetPeriod",
    "budgetPlannedMonth", "budgetPlannedYear", "taskDue", "industry", "partner",
    "capabilities", "competitors", "nextStepComment", "nextStepType", "dml",
  ];
  for (const k of preserveIfEmpty) {
    if (isEmptyScalar(incoming[k]) && !isEmptyScalar(existing[k])) {
      out[k] = existing[k];
    }
  }

  if (Number(incoming.manualProb || 0) === 0 && Number(existing.manualProb || 0) > 0 && !incoming._allowProbClear) {
    out.manualProb = existing.manualProb;
  }

  return out;
}

function detectDataLoss(oldDeal, newDeal) {
  const alerts = [];
  const oldScore = scoreSum(oldDeal?.scores);
  const newScore = scoreSum(newDeal?.scores);
  if (oldScore >= 5 && newScore < 5) {
    alerts.push({ kind: "scores_wiped", oldScore, newScore });
  }
  const oldSegs = oldDeal?.techResearch?.seekingSegments?.length || 0;
  const newSegs = newDeal?.techResearch?.seekingSegments?.length || 0;
  if (oldSegs > 0 && newSegs === 0) {
    alerts.push({ kind: "passport_segments_wiped", oldSegs });
  }
  const oldRisks = oldDeal?.riskTypes?.length || 0;
  const newRisks = newDeal?.riskTypes?.length || 0;
  if (oldRisks > 0 && newRisks === 0) {
    alerts.push({ kind: "risks_wiped", oldRisks });
  }
  return alerts;
}

module.exports = {
  mergeDealPreserveChildren,
  detectDataLoss,
  scoreSum,
  hasScores,
  SCORE_KEYS,
};
