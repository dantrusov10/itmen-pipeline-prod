"use strict";

const { calcDealScore, normalizeManualProb } = require("./metrics");
const { FIELD_LABELS } = require("./audit-labels");

const FINAL_STAGES = ["Успешно реализовано", "Документы подписаны", "Отгружен"];
const LATE_STAGES = ["Согласование бюджета", "Условия согласованы", "Финальный компред", "Предложение выслано"];
const PILOT_STAGES = ["Пилот", "Пилот Окончен", "Подготовка Пилота"];
const EARLY_STAGES = ["Взят в работу", "Встреча состоялась", "Интерес  Выявлен"];

const LEGACY_COMMIT = {
  "Нет": "none", "Устное": "verbal", "Email": "email", "Протокол": "protocol",
  "LOI": "loi", "Гарантийное письмо": "guarantee", "Контракт": "contract",
};

function labelToFieldKey(label) {
  if (!label || label === "—") return null;
  const hit = Object.entries(FIELD_LABELS).find(([, l]) => l === label);
  return hit ? hit[0] : null;
}

function normalizeCommitStatus(v) {
  if (!v) return "none";
  if (LEGACY_COMMIT[v]) return LEGACY_COMMIT[v];
  const ids = ["none", "verbal", "email", "protocol", "loi", "guarantee", "contract"];
  if (ids.includes(v)) return v;
  return "none";
}

function commitScoreFromStatus(commitId) {
  const map = {
    contract: 5, guarantee: 4, loi: 4, protocol: 3, email: 2, verbal: 2, none: 0,
  };
  return map[commitId] ?? 0;
}

function parseScoresJson(raw) {
  if (!raw) return {};
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" ? { ...v } : {};
  } catch {
    return {};
  }
}

function parseProbFromAudit(val) {
  const s = String(val ?? "").replace("%", "").trim();
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function parseAuditValue(key, raw) {
  if (raw == null || raw === "") {
    if (key === "scores") return {};
    if (key === "manualProb") return 0;
    return "";
  }
  if (key === "scores") return parseScoresJson(raw);
  if (key === "manualProb") return parseProbFromAudit(raw);
  if (key === "commitStatus") return normalizeCommitStatus(String(raw).trim());
  if (key === "amount" || key === "expectedBudget") {
    const digits = String(raw).replace(/[^\d]/g, "");
    return Number(digits) || 0;
  }
  if (key === "riskTypes") {
    return String(raw).split(",").map(s => s.trim()).filter(Boolean);
  }
  if (key === "seekingSegments") {
    return String(raw).split(",").map(s => s.trim()).filter(Boolean);
  }
  if (key === "projectTasks") {
    return String(raw).split(";").map(s => s.trim()).filter(Boolean);
  }
  if (key === "productRequirementsPct" || key === "pilotRequirementsPct") {
    const n = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return String(raw);
}

function defaultDealState() {
  return {
    scores: {
      loyalty: 0, commit: 0, budget: 0, fit: 0, timing: 0,
      competitive: 0, access: 0, technical: 0, commercial: 0,
    },
    manualProb: 0,
    budgetStatus: "Неизвестно",
    commitStatus: "none",
    stage: "",
    pains: "",
    amount: 0,
    techResearch: {
      seekingSegments: [],
      productRequirementsPct: null,
      pilotRequirementsPct: null,
      competitorEntries: {},
      changePains: {},
    },
  };
}

function pctToTechnicalScore(pct) {
  if (pct == null || pct === "" || Number.isNaN(pct)) return null;
  const p = +pct;
  if (p >= 90) return 5;
  if (p >= 75) return 4;
  if (p >= 60) return 3;
  if (p >= 40) return 2;
  if (p >= 20) return 1;
  return 0;
}

function syncModelScores(state) {
  const s = state.scores || {};
  const stage = state.stage || "";
  const commit = normalizeCommitStatus(state.commitStatus);

  s.commit = commitScoreFromStatus(commit);

  if (state.budgetStatus === "Подтверждён") s.budget = 5;
  else if (state.budgetStatus === "В процессе согласования") s.budget = 4;
  else if (state.budgetStatus === "Планируется согласование" || state.budgetStatus === "Запланирован") s.budget = 3;
  else if (state.budgetStatus === "Нет бюджета") s.budget = 0;
  else if (state.budgetStatus === "Неизвестно") s.budget = Math.max(s.budget || 0, 1);
  else s.budget = Math.max(s.budget || 0, 1);

  if (FINAL_STAGES.includes(stage)) {
    s.timing = 5;
    s.commercial = 5;
  } else if (LATE_STAGES.includes(stage)) {
    s.timing = 4;
    s.commercial = 4;
  } else if (PILOT_STAGES.includes(stage)) {
    s.timing = Math.max(s.timing || 0, 3);
    s.commercial = Math.max(s.commercial || 0, 2);
    s.fit = Math.max(s.fit || 0, 3);
  } else if (stage === "На паузе") {
    s.timing = 1;
  } else if (stage === "Отказ") {
    s.timing = 0;
  } else if (EARLY_STAGES.includes(stage)) {
    s.timing = Math.max(s.timing || 0, 2);
  }

  if (String(state.pains || "").trim()) {
    s.fit = Math.max(s.fit || 0, 3);
  }

  const tr = state.techResearch || {};
  const pilot = tr.pilotRequirementsPct;
  const product = tr.productRequirementsPct;
  const vals = [pilot, product].filter(v => v != null && !Number.isNaN(v));
  if (vals.length) {
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const tech = pctToTechnicalScore(avg);
    if (tech != null) s.technical = tech;
  }

  if (state.amount > 0 && s.budget < 3) {
    s.budget = Math.max(s.budget || 0, 2);
  }

  state.scores = s;
}

function totalScore(state) {
  syncModelScores(state);
  return calcDealScore(state.scores, state.manualProb);
}

function applyFieldToState(state, key, rawValue) {
  const val = parseAuditValue(key, rawValue);
  const techKeys = new Set([
    "seekingSegments", "seekingOtherLabel", "productRequirementsPct",
    "pilotRequirementsPct", "asIsStack", "changePains", "competitorEntries", "projectTasks",
  ]);
  if (key === "scores") {
    state.scores = { ...defaultDealState().scores, ...val };
    return;
  }
  if (techKeys.has(key)) {
    if (!state.techResearch) state.techResearch = {};
    state.techResearch[key] = val;
    return;
  }
  if (key === "riskTypes") {
    state.riskTypes = val;
    state.riskType = val[0] || "none";
    return;
  }
  state[key] = val;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function formatScoreImpactDelta(delta) {
  if (delta == null) return null;
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : String(delta);
}

function buildScoreImpactMap(auditRows) {
  const byDeal = {};
  for (const row of auditRows || []) {
    if (row.is_new_deal) continue;
    const dealId = row.deal_id || "";
    if (!dealId) continue;
    if (!byDeal[dealId]) byDeal[dealId] = [];
    byDeal[dealId].push(row);
  }

  const impactById = {};

  for (const rows of Object.values(byDeal)) {
    rows.sort((a, b) => {
      const cmp = String(a.at).localeCompare(String(b.at));
      if (cmp !== 0) return cmp;
      return String(a.id).localeCompare(String(b.id));
    });

    const state = defaultDealState();

    for (const row of rows) {
      const key = labelToFieldKey(row.label);
      if (!key) continue;

      const scoreBefore = totalScore(cloneState(state));

      if (row.old_value != null && row.old_value !== "") {
        const rewind = cloneState(state);
        applyFieldToState(rewind, key, row.old_value);
        const fromOld = totalScore(rewind);
        applyFieldToState(state, key, row.new_value);
        const scoreAfter = totalScore(state);
        const delta = scoreAfter - fromOld;
        if (delta !== 0 || scoreBefore !== scoreAfter) {
          impactById[row.id] = formatScoreImpactDelta(scoreAfter - fromOld);
        } else {
          impactById[row.id] = formatScoreImpactDelta(scoreAfter - scoreBefore);
        }
      } else {
        applyFieldToState(state, key, row.new_value);
        const scoreAfter = totalScore(state);
        impactById[row.id] = formatScoreImpactDelta(scoreAfter - scoreBefore);
      }
    }
  }

  return impactById;
}

module.exports = {
  buildScoreImpactMap,
  formatScoreImpactDelta,
  labelToFieldKey,
  parseScoresJson,
  parseProbFromAudit,
};
