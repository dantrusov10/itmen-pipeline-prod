/* Расчётный движок — пайплайн, скоринг, подсказки модели */
const SCORE_WEIGHTS = {
  loyalty: 0.10, commit: 0.10, budget: 0.18, fit: 0.18, timing: 0.14,
  competitive: 0.10, access: 0.08, technical: 0.06, commercial: 0.06,
};

const MANUAL_SCORE_KEYS = new Set(window.ITMEN_CONFIG?.manualScoreKeys || ["loyalty"]);

function commitScoreFromStatus(commitId) {
  const map = {
    contract: 5, guarantee: 4, loi: 4, protocol: 3, email: 2, verbal: 2, none: 0,
  };
  return map[commitId] ?? 0;
}

const COMMIT_BOOST = {
  none: 0, verbal: 0.05, email: 0.05, protocol: 0.15,
  loi: 0.25, guarantee: 0.3, contract: 0.4,
};

const LEGACY_COMMIT = {
  "Нет": "none", "Устное": "verbal", "Email": "email", "Протокол": "protocol",
  "LOI": "loi", "Гарантийное письмо": "guarantee", "Контракт": "contract",
};

const BUDGET_BOOST = {
  "Подтверждён": 0.1,
  "В процессе согласования": 0.03,
  "Запланирован": 0.05,
  "Планируется согласование": 0.05,
  "Нет бюджета": -0.15,
};

function ensureTechResearch(tr) {
  if (typeof migrateTechResearch === "function") return migrateTechResearch(tr);
  return tr || defaultTechResearch?.() || {
    seekingSegments: [], asIsStack: {}, changePains: {}, projectTasks: [],
    projectTasksCustom: "", productRequirementsPct: null, pilotRequirementsPct: null,
  };
}

const FINAL_STAGES = ["Успешно реализовано", "Документы подписаны", "Отгружен"];
const LATE_STAGES = ["Согласование бюджета", "Условия согласованы", "Финальный компред", "Предложение выслано"];
const PILOT_STAGES = ["Пилот", "Пилот Окончен", "Подготовка Пилота"];
const EARLY_STAGES = ["Взят в работу", "Встреча состоялась", "Интерес  Выявлен"];

function commitLabel(id) {
  const c = (window.ITMEN_CONFIG?.commitStatuses || []).find(x => x.id === id);
  return c ? c.label : id || "—";
}

function commitShort(id) {
  const c = (window.ITMEN_CONFIG?.commitStatuses || []).find(x => x.id === id);
  return c ? c.short : id || "—";
}

function normalizeCommitStatus(v) {
  if (!v) return "none";
  if (LEGACY_COMMIT[v]) return LEGACY_COMMIT[v];
  if (COMMIT_BOOST[v] != null) return v;
  const byLabel = (window.ITMEN_CONFIG?.commitStatuses || []).find(
    x => x.label === v || x.short === v
  );
  return byLabel ? byLabel.id : "none";
}

function normalizeRiskTypes(deal) {
  if (Array.isArray(deal?.riskTypes)) {
    return deal.riskTypes.filter(r => r && r !== "none");
  }
  if (deal?.riskType && deal.riskType !== "none") return [deal.riskType];
  return [];
}

function riskLabels(types) {
  const list = normalizeRiskTypes({ riskTypes: types, riskType: types?.[0] });
  if (!list.length) return [];
  return list.map(id => riskLabel(id)).filter(Boolean);
}

function migrateDeal(deal) {
  const d = { ...deal };
  if (d.deadline && !d.taskDue) d.taskDue = d.deadline;
  if (d.revenuePeriod && !d.budgetPeriod) d.budgetPeriod = d.revenuePeriod;
  d.commitStatus = normalizeCommitStatus(d.commitStatus);
  if (d.nextStep && !d.nextStepComment) d.nextStepComment = d.nextStep;
  if (d.risk && !d.riskComment) d.riskComment = d.risk;
  if (!d.nextStepType) d.nextStepType = "discovery";
  d.riskTypes = normalizeRiskTypes(d);
  if (d.riskType === "stale") d.riskType = "none";
  if (!d.riskType) d.riskType = d.riskTypes[0] || "none";
  else if (d.riskTypes.length && !d.riskTypes.includes(d.riskType)) d.riskType = d.riskTypes[0];
  if (!d.scoreReasons) d.scoreReasons = {};
  if (!d.scoreHistory) d.scoreHistory = [];
  if (!d.scoresOverridden) d.scoresOverridden = {};
  if (!d.scores) d.scores = {};
  if (d.scores.commit == null) d.scores.commit = commitScoreFromStatus(normalizeCommitStatus(d.commitStatus));
  if (!d.techResearch) d.techResearch = ensureTechResearch(null);
  else d.techResearch = ensureTechResearch(d.techResearch);
  if (d.budgetAmount && !d.expectedBudget) d.expectedBudget = d.budgetAmount;
  if (d.budgetStatus === "Запланирован") d.budgetStatus = "Планируется согласование";
  if (!d.budgetPlannedMonth) d.budgetPlannedMonth = null;
  if (!d.budgetPlannedYear) d.budgetPlannedYear = null;
  if (!d.partner) d.partner = "Нет партнёра";
  if (d.partnerDiscount == null) d.partnerDiscount = 0;
  if (d.clientDiscount == null) d.clientDiscount = 0;
  if (!d.updatedAt && d.lastUpdate) d.updatedAt = `${d.lastUpdate}T12:00:00.000Z`;
  delete d.deadline;
  delete d.revenuePeriod;
  delete d.evidenceLink;
  delete d.nextStep;
  delete d.risk;
  delete d.artifact;
  return d;
}

function daysBetween(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((today - d) / 86400000);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function calcDealScore(scores) {
  const vals = Object.values(scores || {});
  if (!vals.some(v => v > 0)) return null;
  let sum = 0;
  for (const [k, w] of Object.entries(SCORE_WEIGHTS)) sum += (scores[k] || 0) * w;
  return Math.round((sum / 5) * 100);
}

function calcComputedProb(score, commitStatus, budgetStatus) {
  if (score == null) return null;
  const commit = normalizeCommitStatus(commitStatus);
  let p = score / 100 + (COMMIT_BOOST[commit] ?? 0) + (BUDGET_BOOST[budgetStatus] ?? 0);
  return Math.min(1, Math.max(0, Math.round(p * 100) / 100));
}

function calcCategory(score, commitStatus, budgetStatus) {
  const commit = normalizeCommitStatus(commitStatus);
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

function nextStepLabel(typeId) {
  const t = (window.ITMEN_CONFIG?.nextStepTypes || []).find(x => x.id === typeId);
  return t ? t.label : typeId || "";
}

function nextStepArtifact(typeId) {
  const t = (window.ITMEN_CONFIG?.nextStepTypes || []).find(x => x.id === typeId);
  return t ? t.artifact : "";
}

function riskLabel(typeId) {
  const t = (window.ITMEN_CONFIG?.riskTypes || []).find(x => x.id === typeId);
  return t ? t.label : typeId || "";
}

function pctToTechnicalScore(pct) {
  if (pct == null || pct === "" || isNaN(pct)) return null;
  const p = +pct;
  if (p >= 90) return 5;
  if (p >= 75) return 4;
  if (p >= 60) return 3;
  if (p >= 40) return 2;
  if (p >= 20) return 1;
  return 0;
}

function avgRequirementPct(tr) {
  const vals = [tr.productRequirementsPct, tr.pilotRequirementsPct]
    .filter(v => v != null && v !== "" && !isNaN(v)).map(Number);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function calcRiskFlag(deal, category, daysSinceUpdate, daysToTask) {
  if (!deal.id) return "";
  if (category === "Горячая" && deal.budgetStatus === "Нет бюджета") return "Горячая без бюджета";
  if (daysToTask != null && daysToTask < 0) return "Просрочена ближайшая задача";
  const risks = normalizeRiskTypes(deal);
  if (risks.length) return riskLabels(risks).join("; ");
  return "";
}

function suggestScores(deal) {
  const scores = {
    loyalty: 0, commit: 0, budget: 0, fit: 0, timing: 0,
    competitive: 0, access: 0, technical: 0, commercial: 0,
  };
  const reasons = {};
  const stage = deal.stage || "";
  const commit = normalizeCommitStatus(deal.commitStatus);

  reasons.loyalty = "Оценивается только вручную — модель не подставляет";

  scores.commit = commitScoreFromStatus(commit);
  reasons.commit = `Статус коммита: ${commitLabel(commit)}`;

  if (FINAL_STAGES.includes(stage)) {
    scores.timing = 5; scores.commercial = 5;
    reasons.timing = "Сделка на финальном этапе воронки";
    reasons.commercial = "Документы / отгрузка / закрытие";
  } else if (LATE_STAGES.includes(stage)) {
    scores.timing = 4; scores.commercial = 4;
    reasons.timing = "Стадия согласования условий или бюджета";
    reasons.commercial = "КП или компред в работе";
  } else if (PILOT_STAGES.includes(stage)) {
    scores.timing = 3; scores.commercial = 2; scores.fit = 3;
    reasons.timing = "Пилот — решение ближе, но ещё не финал";
    reasons.fit = "Проверяем соответствие на пилоте";
  } else if (stage === "На паузе") {
    scores.timing = 1;
    reasons.timing = "Сделка на паузе";
  } else if (EARLY_STAGES.includes(stage)) {
    scores.timing = 2;
    reasons.timing = "Ранняя стадия — сроки пока не определены";
  }

  if (deal.budgetStatus === "Подтверждён") {
    scores.budget = 5;
    reasons.budget = "Бюджет подтверждён клиентом";
  } else if (deal.budgetStatus === "В процессе согласования") {
    scores.budget = 4;
    reasons.budget = "Бюджет в процессе согласования";
  } else if (deal.budgetStatus === "Планируется согласование" || deal.budgetStatus === "Запланирован") {
    scores.budget = 3;
    reasons.budget = "Согласование бюджета запланировано";
  } else if (deal.budgetStatus === "Нет бюджета") {
    scores.budget = 0;
    reasons.budget = "Бюджет отсутствует";
  } else {
    scores.budget = 1;
    reasons.budget = "Статус бюджета неизвестен";
  }

  if (!reasons.access) reasons.access = "Оценивается вручную — уточните доступ к ЛПР";

  if (deal.pains?.trim()) {
    scores.fit = Math.max(scores.fit, 3);
    reasons.fit = (reasons.fit ? reasons.fit + ". " : "") + "Боли клиента описаны";
  }

  const tr = migrateTechResearch(deal.techResearch || {});
  const allComp = Object.values(tr.competitorEntries || {}).flat().filter(Boolean);
  if (allComp.some(e => e.status === "selected")) {
    scores.competitive = 0;
    reasons.competitive = "Клиент выбрал другого вендора";
  } else if (allComp.some(e => e.status === "evaluating" || e.status === "planned")) {
    scores.competitive = Math.min(scores.competitive || 3, 2);
    reasons.competitive = "Клиент продолжает смотреть конкурентов";
  } else if (allComp.length && allComp.every(e => e.status === "rejected")) {
    scores.competitive = Math.max(scores.competitive || 0, 3);
    reasons.competitive = "Конкуренты рассмотрены — отказались от всех";
  } else if (allComp.some(e => e.status === "reviewed")) {
    scores.competitive = Math.min(scores.competitive || 3, 3);
    reasons.competitive = (reasons.competitive || "") + " Есть история просмотра конкурентов.";
  } else if (deal.competitors?.trim()) {
    scores.competitive = 2;
    reasons.competitive = "Конкуренты указаны (legacy) — позиция под вопросом";
  } else if (LATE_STAGES.includes(stage) || FINAL_STAGES.includes(stage)) {
    scores.competitive = 4;
    reasons.competitive = "Продвинутый этап без явного конкурента";
  }

  if (deal.amount > 0 && scores.budget < 3) {
    scores.budget = Math.max(scores.budget, 2);
    reasons.budget = (reasons.budget || "") + " Ожидаемая сумма указана.";
  }

  const segCount = tr.seekingSegments?.length || 0;
  const painCount = Object.values(tr.changePains || {}).filter(p => p?.trim()).length;
  if (segCount >= 2) {
    scores.fit = Math.max(scores.fit, 4);
    reasons.fit = (reasons.fit ? reasons.fit + ". " : "") + `${segCount} сегментов в поиске`;
  } else if (segCount === 1) {
    scores.fit = Math.max(scores.fit, 3);
    reasons.fit = (reasons.fit ? reasons.fit + ". " : "") + "Один сегмент в поиске";
  }
  if (painCount >= segCount && segCount > 0) {
    scores.fit = Math.max(scores.fit, 4);
    reasons.fit = (reasons.fit || "") + " Боли по сегментам описаны.";
  }

  const avgPct = avgRequirementPct(tr);
  const techFromPct = pctToTechnicalScore(avgPct);
  if (techFromPct != null) {
    scores.technical = techFromPct;
    reasons.technical = `Среднее соответствие требованиям: ${avgPct}% (продукт ${tr.productRequirementsPct ?? "—"}%, пилот ${tr.pilotRequirementsPct ?? "—"}%)`;
  }

  if (LATE_STAGES.includes(stage) || PILOT_STAGES.includes(stage)) {
    scores.commercial = Math.max(scores.commercial, 3);
    reasons.commercial = (reasons.commercial || "") + " Клиент на стадии пилота/согласования.";
  }
  if (deal.budgetStatus === "Подтверждён") {
    scores.commercial = Math.max(scores.commercial, 4);
    reasons.commercial = "Бюджет подтверждён — клиент ближе к закупке.";
  }

  const risks = normalizeRiskTypes(deal);
  risks.forEach(rt => {
    if (rt === "no_budget") scores.budget = Math.min(scores.budget, 1);
    if (rt === "no_lpr") scores.access = Math.min(scores.access, 1);
    if (rt === "competitor") scores.competitive = Math.min(scores.competitive, 1);
    if (rt === "timing") scores.timing = Math.min(scores.timing, 2);
    if (rt === "technical") scores.technical = 1;
  });

  if (!reasons.technical) reasons.technical = "Оценка по умолчанию — уточните при необходимости";

  return { scores, reasons };
}

const WEIGHTED_SCORE_MIN = 60;

function isWeightedDeal(score, category) {
  if (category === "Горячая" || category === "Тёплая") return true;
  return score != null && score >= WEIGHTED_SCORE_MIN;
}

function weightedAmount(expectedAmount, score, category) {
  return isWeightedDeal(score, category) ? (expectedAmount || 0) : 0;
}

function enrichDeal(deal) {
  const d = migrateDeal(deal);
  const score = calcDealScore(d.scores);
  const computedProb = calcComputedProb(score, d.commitStatus, d.budgetStatus);
  const prob = d.manualProb > 0 ? d.manualProb : (computedProb ?? 0);
  const category = calcCategory(score, d.commitStatus, d.budgetStatus);
  const daysSince = daysBetween(d.lastUpdate);
  const daysTo = daysUntil(d.taskDue);
  const quality = calcDataQuality(d);
  const riskFlag = calcRiskFlag(d, category, daysSince, daysTo);
  const expectedAmount = Number(d.amount) || 0;
  const weighted = weightedAmount(expectedAmount, score, category);
  return {
    ...d, score, computedProb, prob, category, daysSince, daysTo, quality, riskFlag, weighted,
    expectedAmount,
    commitLabel: commitLabel(d.commitStatus),
    projectCompliancePct: d.techResearch?.productRequirementsPct,
    pilotCompliancePct: d.techResearch?.pilotRequirementsPct,
  };
}

/** Сброс расширенных полей паспорта — менеджеры заполняют вручную */
function clearDealExtendedFields(deal) {
  const d = migrateDeal({ ...deal });
  d.manualProb = 0;
  d.taskDue = "";
  d.budgetPeriod = "Не определён";
  d.budgetStatus = "Неизвестно";
  d.budgetPlannedMonth = null;
  d.budgetPlannedYear = null;
  d.commitStatus = "none";
  d.pains = "";
  d.riskTypes = [];
  d.riskType = "none";
  d.riskComment = "";
  d.techResearch = typeof defaultTechResearch === "function" ? defaultTechResearch() : {
    seekingSegments: [], asIsStack: {}, changePains: {}, competitorEntries: {}, projectTasks: [],
    productRequirementsPct: null, pilotRequirementsPct: null,
  };
  if (d.scores) {
    d.scores.commit = commitScoreFromStatus("none");
    d.scores.budget = 1;
    d.scores.technical = 0;
    d.scores.fit = 0;
    d.scores.timing = 0;
    d.scores.competitive = 0;
    d.scores.access = 0;
    d.scores.commercial = 0;
  }
  if (d.scoreReasons) {
    d.scoreReasons.commit = "Статус коммита: Нет подтверждения";
    d.scoreReasons.budget = "Статус бюджета неизвестен";
    d.scoreReasons.technical = "Не заполнено";
    d.scoreReasons.fit = "Не заполнено";
    d.scoreReasons.competitive = "Не заполнено";
    d.scoreReasons.timing = "Не заполнено";
    d.scoreReasons.access = "Оценивается вручную";
    d.scoreReasons.commercial = "Не заполнено";
  }
  return d;
}

function formatMoney(n) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

function formatPct(n) {
  if (n == null || isNaN(n)) return "—";
  return Math.round(n * 100) + "%";
}

function categoryBadge(cat) {
  const map = { "Горячая": "badge-hot", "Тёплая": "badge-warm", "Наблюдение": "badge-watch", "Отказ": "badge-drop" };
  return `<span class="badge ${map[cat] || ""}">${escapeHtml(cat) || "—"}</span>`;
}

function calcMetrics(deals) {
  const all = deals.map(enrichDeal);
  const totalPipeline = all.reduce((s, x) => s + (x.expectedAmount || 0), 0);
  const weighted = all.filter(x => isWeightedDeal(x.score, x.category)).reduce((s, x) => s + (x.expectedAmount || 0), 0);
  const counts = { "Горячая": 0, "Тёплая": 0, "Наблюдение": 0, "Отказ": 0 };
  all.forEach(x => { if (x.category) counts[x.category] = (counts[x.category] || 0) + 1; });
  const scores = all.filter(x => x.score != null).map(x => x.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const incomplete = all.filter(x => x.quality === "Неполный").length;
  const passportStats = typeof calcPassportCompletenessStats === "function"
    ? calcPassportCompletenessStats(all, typeof passportBlockSelection !== "undefined" ? passportBlockSelection : null)
    : null;
  const passportAllBlocksStats = typeof calcPassportCompletenessStats === "function" && typeof PASSPORT_BLOCKS !== "undefined"
    ? calcPassportCompletenessStats(all, PASSPORT_BLOCKS.map(b => b.id))
    : null;
  const passportCompleteness = passportStats?.pct ?? (all.length ? 1 - incomplete / all.length : 0);
  const topRisks = typeof calcTopRisks === "function" ? calcTopRisks(all) : [];
  const managerPassport = typeof calcManagerPassportStats === "function"
    ? calcManagerPassportStats(all, typeof passportBlockSelection !== "undefined" ? passportBlockSelection : null)
    : [];
  const riskFlags = all.filter(x => x.riskFlag).length;
  const confirmedBudget = all.filter(x => x.budgetStatus === "Подтверждён").length;
  const confirmedBudgetSum = all.filter(x => x.budgetStatus === "Подтверждён").reduce((s, x) => s + (x.expectedAmount || 0), 0);
  const commits = window.ITMEN_CONFIG?.commitStatuses || [];
  const commitCounts = {};
  commits.forEach(c => { commitCounts[c.short] = all.filter(x => x.commitStatus === c.id).length; });
  const strongIds = ["protocol", "loi", "guarantee", "contract"];
  const strongCommits = all.filter(x => strongIds.includes(x.commitStatus)).length;
  const hotShare = all.length ? (counts["Горячая"] || 0) / all.length : 0;

  const byOwner = {};
  all.forEach(x => {
    const o = x.owner || "Не назначен";
    if (!byOwner[o]) byOwner[o] = { count: 0, pipeline: 0, weighted: 0, hot: 0, warm: 0, scores: [], incomplete: 0, overdue: 0, risks: 0 };
    byOwner[o].count++;
    byOwner[o].pipeline += x.expectedAmount || 0;
    byOwner[o].weighted += isWeightedDeal(x.score, x.category) ? (x.expectedAmount || 0) : 0;
    if (x.category === "Горячая") byOwner[o].hot++;
    if (x.category === "Тёплая") byOwner[o].warm++;
    if (x.score != null) byOwner[o].scores.push(x.score);
    if (x.quality === "Неполный") byOwner[o].incomplete++;
    if (x.daysTo != null && x.daysTo < 0) byOwner[o].overdue++;
    if (x.riskFlag) byOwner[o].risks++;
  });
  Object.values(byOwner).forEach(v => {
    v.avgScore = v.scores.length ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length) : null;
    delete v.scores;
  });

  const byPartner = {};
  all.forEach(x => {
    const p = x.partner != null && x.partner !== "" ? String(x.partner).trim() : "";
    const partnerKey = p || "Без партнёра";
    if (!byPartner[partnerKey]) byPartner[partnerKey] = { count: 0, pipeline: 0, weighted: 0 };
    byPartner[partnerKey].count++;
    byPartner[partnerKey].pipeline += x.expectedAmount || 0;
    if (isWeightedDeal(x.score, x.category)) byPartner[partnerKey].weighted += x.expectedAmount || 0;
  });

  const byStage = {};
  all.forEach(x => {
    const st = x.stage || "—";
    byStage[st] = (byStage[st] || 0) + 1;
  });
  const stageOrder = state?.lists?.stages || [];
  const stageFunnel = stageOrder.map(st => ({ stage: st, count: byStage[st] || 0 })).filter(x => x.count > 0);
  stageOrder.forEach(st => { if (!stageFunnel.find(x => x.stage === st) && byStage[st]) stageFunnel.push({ stage: st, count: byStage[st] }); });
  Object.keys(byStage).forEach(st => {
    if (!stageFunnel.find(x => x.stage === st)) stageFunnel.push({ stage: st, count: byStage[st] });
  });

  const byBudget = {};
  all.forEach(x => {
    const b = x.budgetStatus || "Неизвестно";
    if (!byBudget[b]) byBudget[b] = { count: 0, pipeline: 0 };
    byBudget[b].count++;
    byBudget[b].pipeline += x.expectedAmount || 0;
  });

  const periodOrder = state?.lists?.budgetPeriods || window.ITMEN_CONFIG?.budgetPeriods || [];
  const byPeriodMap = {};
  all.forEach(x => {
    const p = x.budgetPeriod || "Не определён";
    if (!byPeriodMap[p]) byPeriodMap[p] = { count: 0, pipeline: 0, weighted: 0 };
    byPeriodMap[p].count++;
    byPeriodMap[p].pipeline += x.expectedAmount || 0;
    if (isWeightedDeal(x.score, x.category)) byPeriodMap[p].weighted += x.expectedAmount || 0;
  });
  const byBudgetPeriod = [...periodOrder, ...Object.keys(byPeriodMap).filter(p => !periodOrder.includes(p))]
    .filter(p => byPeriodMap[p])
    .map(period => ({ period, ...byPeriodMap[period] }));

  const budgetMatrix = {};
  const matrixPeriods = [...periodOrder];
  const statusList = state?.lists?.budgetStatus || window.ITMEN_CONFIG?.budgetStatuses || [];
  all.forEach(x => {
    const p = x.budgetPeriod || "Не определён";
    const b = x.budgetStatus || "Неизвестно";
    if (!budgetMatrix[p]) budgetMatrix[p] = {};
    budgetMatrix[p][b] = (budgetMatrix[p][b] || 0) + 1;
    if (!matrixPeriods.includes(p)) matrixPeriods.push(p);
  });

  const loyaltyVals = all.map(x => x.scores?.loyalty).filter(v => v != null && v > 0);
  const avgLoyalty = loyaltyVals.length
    ? Math.round((loyaltyVals.reduce((a, b) => a + b, 0) / loyaltyVals.length) * 10) / 10
    : null;
  const highLoyalty = all.filter(x => (x.scores?.loyalty || 0) >= 4).length;

  const segmentLabels = Object.fromEntries((window.ITMEN_CONFIG?.techSegments || []).map(s => [s.id, s.label]));
  const seekingCounts = {};
  all.forEach(x => (x.techResearch?.seekingSegments || []).forEach(seg => {
    const label = seg === "other"
      ? (x.techResearch?.seekingOtherLabel?.trim() || "Другое")
      : (segmentLabels[seg] || seg);
    seekingCounts[label] = (seekingCounts[label] || 0) + 1;
  }));
  const topSegments = Object.entries(seekingCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const compStats = calcCompetitorAnalytics(all);

  const productPcts = all.map(x => x.projectCompliancePct).filter(v => v != null);
  const pilotPcts = all.map(x => x.pilotCompliancePct).filter(v => v != null);
  const avgProductPct = productPcts.length ? Math.round(productPcts.reduce((a, b) => a + b, 0) / productPcts.length) : null;
  const avgPilotPct = pilotPcts.length ? Math.round(pilotPcts.reduce((a, b) => a + b, 0) / pilotPcts.length) : null;

  const topDeals = [...all].sort((a, b) => (b.weighted || 0) - (a.weighted || 0) || (b.expectedAmount || 0) - (a.expectedAmount || 0)).slice(0, 10);
  const attention = all.filter(x =>
    x.quality === "Неполный" ||
    (x.daysTo != null && x.daysTo < 0) ||
    (x.category === "Горячая" && x.budgetStatus === "Нет бюджета")
  ).slice(0, 12);

  const pilotStages = ["Подготовка Пилота", "Пилот", "Пилот Окончен"];
  const inPilot = all.filter(x => pilotStages.includes(x.stage)).length;

  return {
    totalPipeline, weighted, counts, avgScore, incomplete, riskFlags,
    confirmedBudget, confirmedBudgetSum, commitCounts, strongCommits, hotShare,
    passportCompleteness, passportStats, passportIncomplete: passportStats?.incomplete ?? incomplete,
    passportAllBlocksPct: passportAllBlocksStats?.pct ?? 0,
    topRisks, managerPassport, byOwner, stageFunnel, byBudget, byBudgetPeriod,
    avgLoyalty, highLoyalty, topSegments,
    avgProductPct, avgPilotPct, topDeals, attention, inPilot, deals: all,
    pipelineCount: all.length, byPartner, budgetMatrix, budgetMatrixPeriods: matrixPeriods,
    budgetMatrixStatuses: statusList,
    ...compStats,
  };
}

function normCompetitorToken(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Ключ группировки: один вендор без продукта = одна строка; иначе vendor / product */
function competitorEntryKey(e) {
  const vendorRaw = String(e?.vendor || "").trim();
  const productRaw = String(e?.product || "").trim();
  const vendor = normCompetitorToken(vendorRaw);
  const product = normCompetitorToken(productRaw);
  if (!vendor || vendor === "—") return "— / —";
  if (!product || product === "—") return vendor;
  return `${vendor} / ${product}`;
}

function competitorEntryLabel(e) {
  const vendor = String(e?.vendor || "").trim() || "—";
  const product = String(e?.product || "").trim();
  if (!product || product === "—") return vendor;
  return `${vendor} · ${product}`;
}

function calcCompetitorAnalytics(all) {
  const statusLabels = Object.fromEntries((window.ITMEN_CONFIG?.competitorStatuses || []).map(s => [s.id, s.label]));
  const byVendor = {};
  const statusTotals = {};
  let dealsWithCompetitors = 0;

  all.forEach(d => {
    const entries = Object.values(d.techResearch?.competitorEntries || {}).flat()
      .filter(e => e && (e.vendor || e.product));
    if (!entries.length) return;
    dealsWithCompetitors++;
    const keysInDeal = new Set();
    entries.forEach(e => {
      const key = competitorEntryKey(e);
      if (!byVendor[key]) {
        byVendor[key] = {
          key,
          vendor: String(e?.vendor || "").trim() || "—",
          product: String(e?.product || "").trim(),
          dealCount: 0,
          mentions: 0,
          statuses: {},
        };
      }
      byVendor[key].mentions++;
      const st = e.status || "unknown";
      byVendor[key].statuses[st] = (byVendor[key].statuses[st] || 0) + 1;
      statusTotals[st] = (statusTotals[st] || 0) + 1;
      keysInDeal.add(key);
    });
    keysInDeal.forEach(k => { byVendor[k].dealCount++; });
  });

  const topCompetitors = Object.values(byVendor)
    .sort((a, b) => b.dealCount - a.dealCount || b.mentions - a.mentions)
    .slice(0, 10);
  const competitorStatusSummary = Object.entries(statusTotals)
    .map(([id, count]) => ({ id, label: statusLabels[id] || id, count }))
    .sort((a, b) => b.count - a.count);

  return { topCompetitors, competitorStatusSummary, dealsWithCompetitors };
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
