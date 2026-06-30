"use strict";

const {
  listAll,
  findOne,
  createRecord,
  updateRecord,
  deleteRecord,
  deleteByFilter,
} = require("./pb-client");
const { mergePresaleIntoDeals } = require("./presale-data");
const { loadSalesLossMetaMap, mergeSalesLossExtraIntoDeal, setSalesLossExtra } = require("./sales-loss-meta");

function isoDate(val) {
  if (!val) return null;
  if (String(val).includes("T")) return String(val);
  return `${val}T12:00:00.000Z`;
}

function groupBy(rows, key) {
  const map = {};
  for (const row of rows) {
    const k = row[key];
    if (!map[k]) map[k] = [];
    map[k].push(row);
  }
  return map;
}

function listsFromRows(rows) {
  const lists = {};
  const configKeys = new Set([
    "kanban_stages", "presale_kanban_stages", "partner_kanban_stages", "tech_partner_kanban_stages",
  ]);
  const sorted = [...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const row of sorted) {
    if (row.active === false) continue;
    if (configKeys.has(row.list_key)) continue;
    if (!lists[row.list_key]) lists[row.list_key] = [];
    lists[row.list_key].push(row.value);
  }
  return lists;
}

function scoringFromRows(rows) {
  return [...rows]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(r => ({
      name: r.name,
      weight: r.weight,
      col: r.col,
      owner: r.owner,
      question: r.question || "",
      s5: r.rubric_s5,
      s4: r.rubric_s4,
      s3: r.rubric_s3,
      s2: r.rubric_s2,
      s1: r.rubric_s1,
      s0: r.rubric_s0,
    }));
}

function mapDealRow(d) {
  const pains = d.pains || "";
  return {
    deal_id: d.id,
    customer: d.customer || "",
    industry: d.industry || "",
    owner: d.owner || "",
    stage: d.stage || "",
    deal_type: d.dealType || "",
    amount: d.amount || 0,
    expected_budget: d.expectedBudget || 0,
    partner: d.partner || "",
    partner_discount: d.partnerDiscount || 0,
    client_discount: d.clientDiscount || 0,
    manual_prob: d.manualProb || 0,
    task_due: d.taskDue || "",
    budget_period: d.budgetPeriod || "",
    budget_status: d.budgetStatus || "",
    budget_planned_month: d.budgetPlannedMonth ?? null,
    budget_planned_year: d.budgetPlannedYear ?? null,
    pains,
    capabilities: d.capabilities || "",
    dml: d.dml || "",
    next_step_type: d.nextStepType || "",
    next_step_comment: d.nextStepComment || "",
    risk_type: d.riskType || "",
    risk_comment: d.riskComment || "",
    commit_status: d.commitStatus || "",
    last_update: d.lastUpdate || "",
    amo_id: d.amoId || 0,
    has_pains: Boolean(d.hasPains) || Boolean(String(pains).trim()),
    competitors: d.competitors || "",
    deal_updated_at: isoDate(d.updatedAt || d.lastUpdate),
    archived: Boolean(d.archived),
    archived_at: d.archivedAt || null,
    loss_reason: d.lossReason || "",
    duplicate_of: d.duplicateOf || "",
    pilot_feasibility_pct: d.pilotFeasibilityPct ?? null,
    product_feasibility_pct: d.productFeasibilityPct ?? null,
    pilot_req_count: d.pilotReqCount ?? null,
    product_req_count: d.productReqCount ?? null,
    requirements_updated_at: d.requirementsUpdatedAt || null,
    presale_stage: d.presale?.stage || d.presale_stage || "",
    presale_owner: d.presale?.owner || d.presale_owner || "",
  };
}

function pickRequirementPct(dealPct, techPct) {
  const d = dealPct != null && dealPct !== "" ? Number(dealPct) : null;
  const t = techPct != null && techPct !== "" ? Number(techPct) : null;
  if (d != null && d > 0) return d;
  if (t != null && t > 0) return t;
  if (d != null) return d;
  return t;
}

function assembleDealChildren(deal, children) {
  const scores = {};
  const scoreReasons = {};
  const scoresOverridden = {};
  for (const row of children.scores || []) {
    scores[row.criterion_key] = row.value ?? 0;
    if (row.reason) scoreReasons[row.criterion_key] = row.reason;
    if (row.overridden) scoresOverridden[row.criterion_key] = true;
  }

  const riskTypes = (children.risks || []).map(r => r.risk_type).filter(Boolean);
  const rt = deal.risk_type;
  if (rt && rt !== "none" && !riskTypes.includes(rt)) riskTypes.push(rt);

  const tr = children.tech?.[0] || {};
  const techResearch = {
    seekingOtherLabel: tr.seeking_other_label || "",
    productRequirementsPct: pickRequirementPct(deal.product_feasibility_pct, tr.product_requirements_pct),
    pilotRequirementsPct: pickRequirementPct(deal.pilot_feasibility_pct, tr.pilot_requirements_pct),
    seekingSegments: (children.seeking || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(s => s.segment_id),
    projectTasks: (children.tasks || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(t => t.task),
    asIsStack: {},
    changePains: {},
    competitorEntries: {},
  };

  for (const row of children.asIs || []) {
    techResearch.asIsStack[row.segment_id] = {
      vendor: row.vendor || "",
      product: row.product || "",
      catalogKey: row.catalog_key || "",
      comment: row.comment || "",
      custom: Boolean(row.custom),
    };
  }
  for (const row of children.pains || []) {
    techResearch.changePains[row.segment_id] = row.pain_text || "";
  }
  for (const row of children.competitors || []) {
    const seg = row.segment_id;
    if (!techResearch.competitorEntries[seg]) techResearch.competitorEntries[seg] = [];
    techResearch.competitorEntries[seg].push({
      vendor: row.vendor || "",
      product: row.product || "",
      catalogKey: row.catalog_key || "",
      status: row.status || "evaluating",
      rejectReason: row.reject_reason || "",
      continueReason: row.continue_reason || "",
      comment: row.comment || "",
    });
  }

  const scoreHistory = (children.history || [])
    .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)))
    .map(h => {
      const items = (children.historyItems || []).filter(i => i.history === h.id);
      const histScores = {};
      for (const item of items) histScores[item.criterion_key] = item.value ?? 0;
      return {
        date: h.recorded_at || "",
        source: h.source || "",
        scores: histScores,
      };
    });

  return {
    id: deal.deal_id,
    customer: deal.customer || "",
    industry: deal.industry || "",
    owner: deal.owner || "",
    stage: deal.stage || "",
    dealType: deal.deal_type || "",
    amount: deal.amount || 0,
    expectedBudget: deal.expected_budget || 0,
    partner: deal.partner || "",
    partnerDiscount: deal.partner_discount || 0,
    clientDiscount: deal.client_discount || 0,
    manualProb: (() => {
      const n = Number(deal.manual_prob || 0);
      if (!Number.isFinite(n) || n <= 0) return 0;
      if (n <= 1) return n;
      if (n <= 100) return n / 100;
      let x = n;
      while (x > 100) x /= 100;
      return Math.min(1, x / 100);
    })(),
    taskDue: deal.task_due || "",
    budgetPeriod: deal.budget_period || "",
    budgetStatus: deal.budget_status || "",
    budgetPlannedMonth: deal.budget_planned_month,
    budgetPlannedYear: deal.budget_planned_year,
    pains: deal.pains || "",
    capabilities: deal.capabilities || "",
    dml: deal.dml || "",
    nextStepType: deal.next_step_type || "",
    nextStepComment: deal.next_step_comment || "",
    riskType: deal.risk_type || "",
    riskComment: deal.risk_comment || "",
    commitStatus: deal.commit_status || "",
    lastUpdate: deal.last_update || "",
    amoId: deal.amo_id || 0,
    hasPains: Boolean(deal.has_pains),
    competitors: deal.competitors || "",
    updatedAt: deal.deal_updated_at || isoDate(deal.last_update),
    archived: Boolean(deal.archived),
    archivedAt: deal.archived_at || null,
    lossReason: deal.loss_reason || "",
    duplicateOf: deal.duplicate_of || "",
    pilotFeasibilityPct: deal.pilot_feasibility_pct ?? null,
    productFeasibilityPct: deal.product_feasibility_pct ?? null,
    pilotReqCount: deal.pilot_req_count ?? null,
    productReqCount: deal.product_req_count ?? null,
    requirementsUpdatedAt: deal.requirements_updated_at || null,
    presale_stage: deal.presale_stage || "",
    presale_owner: deal.presale_owner || "",
    scores,
    scoreReasons,
    scoresOverridden,
    riskTypes,
    scoreHistory,
    techResearch,
  };
}

function stripLiteDeal(d) {
  const copy = JSON.parse(JSON.stringify(d));
  if (copy.pains && String(copy.pains).trim()) copy.hasPains = true;
  delete copy.pains;
  delete copy.riskComment;
  if (copy.techResearch) {
    copy.techResearch = {
      seekingSegments: copy.techResearch.seekingSegments || [],
      seekingOtherLabel: copy.techResearch.seekingOtherLabel || "",
      productRequirementsPct: copy.techResearch.productRequirementsPct,
      pilotRequirementsPct: copy.techResearch.pilotRequirementsPct,
      competitorEntries: copy.techResearch.competitorEntries || {},
    };
  }
  delete copy.scoreHistory;
  copy._lite = true;
  return copy;
}

async function loadChildrenByDeal() {
  const [
    scores, risks, tech, seeking, tasks, asIs, pains, competitors,
    history, historyItems,
  ] = await Promise.all([
    listAll("deal_scores"),
    listAll("deal_risks"),
    listAll("deal_tech"),
    listAll("deal_seeking_segments"),
    listAll("deal_project_tasks"),
    listAll("deal_as_is"),
    listAll("deal_change_pains"),
    listAll("deal_competitors"),
    listAll("deal_score_history"),
    listAll("deal_score_history_items"),
  ]);

  const byDeal = {};
  const ensure = id => {
    if (!byDeal[id]) {
      byDeal[id] = {
        scores: [], risks: [], tech: [], seeking: [], tasks: [],
        asIs: [], pains: [], competitors: [], history: [], historyItems: [],
      };
    }
    return byDeal[id];
  };

  for (const row of scores) ensure(row.deal).scores.push(row);
  for (const row of risks) ensure(row.deal).risks.push(row);
  for (const row of tech) ensure(row.deal).tech.push(row);
  for (const row of seeking) ensure(row.deal).seeking.push(row);
  for (const row of tasks) ensure(row.deal).tasks.push(row);
  for (const row of asIs) ensure(row.deal).asIs.push(row);
  for (const row of pains) ensure(row.deal).pains.push(row);
  for (const row of competitors) ensure(row.deal).competitors.push(row);
  for (const row of history) ensure(row.deal).history.push(row);
  const historyDeal = Object.fromEntries(history.map(h => [h.id, h.deal]));
  for (const row of historyItems) {
    const dealPbId = historyDeal[row.history];
    if (dealPbId) ensure(dealPbId).historyItems.push(row);
  }

  return byDeal;
}

async function loadPipelineState({ lite = false, dealId = null, includeArchived = false } = {}) {
  const [metaRow, listRows, scoringRows, dealRows] = await Promise.all([
    findOne("pipeline_meta", 'slug="main"'),
    listAll("list_items", { sort: "sort_order" }),
    listAll("scoring_criteria", { sort: "sort_order" }),
    dealId
      ? listAll("deals", { filter: `deal_id="${dealId.replace(/"/g, '\\"')}"` })
      : listAll("deals", { sort: "deal_id" }),
  ]);

  if (dealId && !dealRows.length) return null;

  const activeRows = includeArchived
    ? dealRows
    : dealRows.filter(row => !row.archived);

  const childrenByDeal = lite && !dealId
    ? await loadLiteChildren()
    : await loadChildrenByDeal();

  const deals = activeRows.map(row => {
    const children = childrenByDeal[row.id] || {};
    return assembleDealChildren(row, children);
  });

  const dealsWithPresale = await mergePresaleIntoDeals(deals);
  const lossMap = await loadSalesLossMetaMap();
  const mergedDeals = dealsWithPresale.map(d => mergeSalesLossExtraIntoDeal(d, lossMap));
  if (dealId) return mergedDeals[0] || null;

  const meta = metaRow || {};
  const state = {
    lists: listsFromRows(listRows),
    scoring: scoringFromRows(scoringRows),
    deals: lite ? mergedDeals.map(stripLiteDeal) : mergedDeals,
    nextId: meta.next_id || 1,
    pipelineFocus: {
      title: meta.focus_title || "",
      goal: meta.focus_goal || "",
      risk: meta.focus_risk || "",
      nextStep: meta.focus_next_step || "",
    },
    _savedAt: meta.saved_at || null,
    _savedBy: meta.saved_by || "web",
    _dataEpoch: meta.data_epoch || 1,
  };

  return state;
}

async function loadLiteChildren() {
  const [scores, risks, tech, seeking, competitors] = await Promise.all([
    listAll("deal_scores"),
    listAll("deal_risks"),
    listAll("deal_tech"),
    listAll("deal_seeking_segments"),
    listAll("deal_competitors"),
  ]);

  const byDeal = {};
  const ensure = id => {
    if (!byDeal[id]) {
      byDeal[id] = { scores: [], risks: [], tech: [], seeking: [], competitors: [] };
    }
    return byDeal[id];
  };

  for (const row of scores) ensure(row.deal).scores.push(row);
  for (const row of risks) ensure(row.deal).risks.push(row);
  for (const row of tech) ensure(row.deal).tech.push(row);
  for (const row of seeking) ensure(row.deal).seeking.push(row);
  for (const row of competitors) ensure(row.deal).competitors.push(row);
  return byDeal;
}

async function deleteDealChildren(pbDealId) {
  const childCollections = [
    "deal_score_history",
    "deal_scores",
    "deal_risks",
    "deal_competitors",
    "deal_change_pains",
    "deal_as_is",
    "deal_project_tasks",
    "deal_seeking_segments",
    "deal_tech",
  ];

  try {
    const histories = await listAll("deal_score_history", { filter: `deal="${pbDealId}"` });
    for (const h of histories) {
      try {
        await deleteByFilter("deal_score_history_items", `history="${h.id}"`);
      } catch (e) {
        console.warn(`deleteDealChildren: deal_score_history_items history=${h.id}`, e.message);
      }
    }
  } catch (e) {
    console.warn("deleteDealChildren: deal_score_history", e.message);
  }

  for (const name of childCollections) {
    try {
      await deleteByFilter(name, `deal="${pbDealId}"`);
    } catch (e) {
      console.warn(`deleteDealChildren: ${name}`, e.message);
    }
  }
}

async function importDealChildren(pbDealId, d) {
  for (const rt of d.riskTypes || []) {
    if (rt && rt !== "none") {
      await createRecord("deal_risks", { deal: pbDealId, risk_type: String(rt) });
    }
  }
  const rt = d.riskType;
  if (rt && rt !== "none" && !(d.riskTypes || []).includes(rt)) {
    await createRecord("deal_risks", { deal: pbDealId, risk_type: String(rt) });
  }

  const scores = d.scores || {};
  const reasons = d.scoreReasons || {};
  const overridden = d.scoresOverridden || {};
  for (const [key, val] of Object.entries(scores)) {
    await createRecord("deal_scores", {
      deal: pbDealId,
      criterion_key: key,
      value: val ?? 0,
      reason: reasons[key] || "",
      overridden: Boolean(overridden[key]),
    });
  }

  for (const entry of d.scoreHistory || []) {
    const hist = await createRecord("deal_score_history", {
      deal: pbDealId,
      recorded_at: entry.date || "",
      source: entry.source || "",
    });
    for (const [key, val] of Object.entries(entry.scores || {})) {
      await createRecord("deal_score_history_items", {
        history: hist.id,
        criterion_key: key,
        value: val ?? 0,
      });
    }
  }

  const tr = d.techResearch || {};
  await createRecord("deal_tech", {
    deal: pbDealId,
    seeking_other_label: tr.seekingOtherLabel || "",
    product_requirements_pct: tr.productRequirementsPct ?? null,
    pilot_requirements_pct: tr.pilotRequirementsPct ?? null,
  });

  for (let i = 0; i < (tr.seekingSegments || []).length; i += 1) {
    const seg = tr.seekingSegments[i];
    if (seg) {
      await createRecord("deal_seeking_segments", {
        deal: pbDealId, segment_id: String(seg), sort_order: i,
      });
    }
  }

  for (let i = 0; i < (tr.projectTasks || []).length; i += 1) {
    const task = tr.projectTasks[i];
    if (task) {
      await createRecord("deal_project_tasks", {
        deal: pbDealId, task: String(task), sort_order: i,
      });
    }
  }

  for (const [segId, raw] of Object.entries(tr.asIsStack || {})) {
    const a = typeof raw === "object" ? raw : { vendor: String(raw || ""), custom: true };
    await createRecord("deal_as_is", {
      deal: pbDealId,
      segment_id: String(segId),
      vendor: a.vendor || "",
      product: a.product || "",
      catalog_key: a.catalogKey || "",
      comment: a.comment || "",
      custom: Boolean(a.custom),
    });
  }

  for (const [segId, pain] of Object.entries(tr.changePains || {})) {
    await createRecord("deal_change_pains", {
      deal: pbDealId,
      segment_id: String(segId),
      pain_text: String(pain || ""),
    });
  }

  for (const [segId, entries] of Object.entries(tr.competitorEntries || {})) {
    for (let i = 0; i < (entries || []).length; i += 1) {
      const e = entries[i];
      if (!e) continue;
      await createRecord("deal_competitors", {
        deal: pbDealId,
        segment_id: String(segId),
        vendor: e.vendor || "",
        product: e.product || "",
        catalog_key: e.catalogKey || "",
        status: e.status || "evaluating",
        reject_reason: e.rejectReason || "",
        continue_reason: e.continueReason || "",
        comment: e.comment || "",
        sort_order: i,
      });
    }
  }
}

async function upsertDeal(d) {
  const existing = await findOne("deals", `deal_id="${String(d.id).replace(/"/g, '\\"')}"`);
  const row = mapDealRow(d);
  let pbId;
  if (existing) {
    pbId = existing.id;
    await updateRecord("deals", pbId, row);
    await deleteDealChildren(pbId);
  } else {
    const created = await createRecord("deals", row);
    pbId = created.id;
  }
  await importDealChildren(pbId, d);
  if (d.id) {
    await setSalesLossExtra(d.id, {
      lossCompetitorKey: d.lossCompetitorKey,
      lossSolutionSegments: d.lossSolutionSegments,
      lossItmenDiscoveryOnly: d.lossItmenDiscoveryOnly,
      lossOtherComment: d.lossOtherComment,
    });
  }
  return pbId;
}

async function deleteDealByDealId(dealId) {
  const existing = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  if (!existing) return;
  const pbId = existing.id;
  const crmChildren = [
    "deal_activities",
    "deal_files",
    "deal_tasks",
    "deal_contacts",
    "deal_info",
    "pilot_requirements",
    "product_requirements",
  ];
  for (const name of crmChildren) {
    try {
      await deleteByFilter(name, `deal="${pbId}"`);
    } catch (e) {
      console.warn(`deleteDealByDealId: ${name}`, e.message);
    }
  }
  await deleteDealChildren(pbId);
  await deleteRecord("deals", pbId);
}

async function updatePipelineMeta(state, dataEpoch) {
  const meta = await findOne("pipeline_meta", 'slug="main"');
  const pf = state.pipelineFocus || {};
  const body = {
    slug: "main",
    next_id: state.nextId || 1,
    data_epoch: dataEpoch,
    saved_at: new Date().toISOString(),
    saved_by: state._savedBy || "web",
    focus_title: pf.title || "",
    focus_goal: pf.goal || "",
    focus_risk: pf.risk || "",
    focus_next_step: pf.nextStep || "",
  };
  if (meta) await updateRecord("pipeline_meta", meta.id, body);
  else await createRecord("pipeline_meta", body);
}

async function touchMetaAfterDealSave(savedBy) {
  const meta = await findOne("pipeline_meta", 'slug="main"');
  if (!meta) return null;
  const nextEpoch = (meta.data_epoch || 1) + 1;
  await updateRecord("pipeline_meta", meta.id, {
    saved_at: new Date().toISOString(),
    saved_by: savedBy || "web",
    data_epoch: nextEpoch,
  });
  return meta;
}

async function computeNextDealId() {
  const meta = await findOne("pipeline_meta", 'slug="main"');
  let nextId = Number(meta?.next_id) || 1;
  const rows = await listAll("deals", { fields: "deal_id" });
  for (const row of rows) {
    const m = /^D-(\d+)$/i.exec(String(row.deal_id || ""));
    if (m) nextId = Math.max(nextId, parseInt(m[1], 10) + 1);
  }
  return { nextId, meta };
}

async function allocateDealId() {
  const { nextId, meta } = await computeNextDealId();
  const dealId = `D-${String(nextId).padStart(3, "0")}`;
  if (meta) {
    await updateRecord("pipeline_meta", meta.id, { next_id: nextId + 1 });
  }
  return dealId;
}

async function dealIdExists(dealId) {
  if (!dealId) return false;
  const existing = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  return Boolean(existing);
}

async function saveSingleDeal(deal, { savedBy = "web", isNew = false } = {}) {
  let oldDeal = null;
  let created = isNew;

  if (isNew) {
    oldDeal = null;
    if (!deal.id || await dealIdExists(deal.id)) {
      deal = { ...deal, id: await allocateDealId() };
    } else {
      const { nextId, meta } = await computeNextDealId();
      const m = /^D-(\d+)$/i.exec(String(deal.id));
      const used = m ? parseInt(m[1], 10) + 1 : nextId;
      if (meta && used > (meta.next_id || 1)) {
        await updateRecord("pipeline_meta", meta.id, { next_id: used });
      }
    }
  } else {
    oldDeal = await loadPipelineState({ dealId: deal.id });
    created = !oldDeal;
  }

  await upsertDeal(deal);
  await touchMetaAfterDealSave(savedBy);
  const saved = await loadPipelineState({ dealId: deal.id });
  const { nextId } = await computeNextDealId();
  return { saved, oldDeal, isNew: created, nextId };
}

async function savePipelineState(mergedState, { deletedDealIds = [] } = {}) {
  for (const id of deletedDealIds) {
    await deleteDealByDealId(id);
  }
  for (const deal of mergedState.deals || []) {
    if (!deal?.id) continue;
    await upsertDeal(deal);
  }

  const meta = await findOne("pipeline_meta", 'slug="main"');
  const nextEpoch = (meta?.data_epoch || 1) + 1;
  await updatePipelineMeta(mergedState, nextEpoch);
  return loadPipelineState({ lite: false });
}

module.exports = {
  loadPipelineState,
  savePipelineState,
  saveSingleDeal,
  upsertDeal,
  deleteDealByDealId,
  listsFromRows,
  scoringFromRows,
  allocateDealId,
};
