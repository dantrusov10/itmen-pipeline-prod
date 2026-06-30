"use strict";

const SCORE_WEIGHTS = {
  loyalty: 0.08,
  commit: 0.08,
  budget: 0.144,
  fit: 0.144,
  timing: 0.112,
  competitive: 0.08,
  access: 0.064,
  technical: 0.048,
  commercial: 0.048,
  manualProb: 0.20,
};

function normalizeManualProb(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 1) return Math.min(1, n);
  if (n <= 100) return Math.min(1, n / 100);
  let x = n;
  while (x > 100) x /= 100;
  return Math.min(1, x / 100);
}

function manualProbToScore(prob) {
  const p = normalizeManualProb(prob);
  if (p <= 0) return 0;
  return Math.round(p * 5);
}

function calcDealScore(scores, manualProb) {
  const s = { ...(scores || {}) };
  const mp = manualProbToScore(manualProb);
  if (mp > 0) s.manualProb = mp;
  const vals = Object.values(s);
  if (!vals.some(v => v > 0)) return null;
  let sum = 0;
  for (const [k, w] of Object.entries(SCORE_WEIGHTS)) sum += (s[k] || 0) * w;
  return Math.round((sum / 5) * 100);
}

function calcCategory(score, commitStatus, budgetStatus) {
  const commit = commitStatus || "none";
  if (score == null && commit !== "contract") return "";
  if (commit === "contract") return "Горячая";
  if (budgetStatus === "Нет бюджета") {
    if (score >= 60) return "Тёплая";
    if (score >= 40) return "Наблюдение";
    return "Отказ";
  }
  if (score >= 80) return "Горячая";
  if (score >= 60) return "Тёплая";
  if (score >= 40) return "Наблюдение";
  return "Отказ";
}

function isWeightedDeal(score, category) {
  return score != null && score >= 60 && category !== "Отказ";
}

function formatDateMsk(d = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(d);
}

module.exports = {
  calcDealScore,
  calcCategory,
  isWeightedDeal,
  formatDateMsk,
  SCORE_WEIGHTS,
  normalizeManualProb,
  manualProbToScore,
};
