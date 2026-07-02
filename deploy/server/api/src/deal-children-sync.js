"use strict";

const {
  listAll,
  createRecord,
  updateRecord,
  deleteRecord,
} = require("./pb-client");

async function syncScores(pbDealId, scores, reasons, overridden) {
  const rows = await listAll("deal_scores", { filter: `deal="${pbDealId}"` });
  const byKey = new Map(rows.map(r => [r.criterion_key, r]));
  const want = scores || {};
  for (const [key, val] of Object.entries(want)) {
    const body = {
      deal: pbDealId,
      criterion_key: key,
      value: val ?? 0,
      reason: reasons?.[key] || "",
      overridden: Boolean(overridden?.[key]),
    };
    const row = byKey.get(key);
    if (row) await updateRecord("deal_scores", row.id, body);
    else await createRecord("deal_scores", body);
  }
  for (const row of rows) {
    if (!(row.criterion_key in want)) await deleteRecord("deal_scores", row.id);
  }
}

async function syncRisks(pbDealId, d) {
  const want = new Set();
  for (const rt of d.riskTypes || []) {
    if (rt && rt !== "none") want.add(String(rt));
  }
  if (d.riskType && d.riskType !== "none") want.add(String(d.riskType));
  const rows = await listAll("deal_risks", { filter: `deal="${pbDealId}"` });
  const have = new Set(rows.map(r => r.risk_type));
  for (const rt of want) {
    if (!have.has(rt)) await createRecord("deal_risks", { deal: pbDealId, risk_type: rt });
  }
  for (const row of rows) {
    if (!want.has(row.risk_type)) await deleteRecord("deal_risks", row.id);
  }
}

async function syncScoreHistory(pbDealId, history) {
  const rows = await listAll("deal_score_history", { filter: `deal="${pbDealId}"` });
  const itemRows = [];
  for (const h of rows) {
    const items = await listAll("deal_score_history_items", { filter: `history="${h.id}"` });
    itemRows.push(...items);
  }
  const keyOf = e => `${e.date || ""}|${e.source || ""}`;
  const wantKeys = new Set((history || []).map(keyOf));
  const rowByKey = new Map(rows.map(r => [`${r.recorded_at || ""}|${r.source || ""}`, r]));

  for (const entry of history || []) {
    const k = keyOf(entry);
    let hist = rowByKey.get(k);
    if (!hist) {
      hist = await createRecord("deal_score_history", {
        deal: pbDealId,
        recorded_at: entry.date || "",
        source: entry.source || "",
      });
      rowByKey.set(k, hist);
    }
    const existingItems = await listAll("deal_score_history_items", { filter: `history="${hist.id}"` });
    const byKey = new Map(existingItems.map(i => [i.criterion_key, i]));
    for (const [criterion, val] of Object.entries(entry.scores || {})) {
      const body = { history: hist.id, criterion_key: criterion, value: val ?? 0 };
      const row = byKey.get(criterion);
      if (row) await updateRecord("deal_score_history_items", row.id, body);
      else await createRecord("deal_score_history_items", body);
    }
    for (const row of existingItems) {
      if (!(row.criterion_key in (entry.scores || {}))) {
        await deleteRecord("deal_score_history_items", row.id);
      }
    }
  }

  for (const row of rows) {
    const k = `${row.recorded_at || ""}|${row.source || ""}`;
    if (!wantKeys.has(k)) {
      await listAll("deal_score_history_items", { filter: `history="${row.id}"` })
        .then(items => Promise.all(items.map(i => deleteRecord("deal_score_history_items", i.id))));
      await deleteRecord("deal_score_history", row.id);
    }
  }
}

async function syncDealTech(pbDealId, tr) {
  const rows = await listAll("deal_tech", { filter: `deal="${pbDealId}"` });
  const body = {
    deal: pbDealId,
    seeking_other_label: tr?.seekingOtherLabel || "",
    product_requirements_pct: tr?.productRequirementsPct ?? null,
    pilot_requirements_pct: tr?.pilotRequirementsPct ?? null,
  };
  if (rows[0]) await updateRecord("deal_tech", rows[0].id, body);
  else await createRecord("deal_tech", body);
}

async function syncOrderedRows(pbDealId, collection, fieldName, values, extra = () => ({})) {
  const rows = await listAll(collection, { filter: `deal="${pbDealId}"`, sort: "sort_order" });
  const want = (values || []).map((v, i) => ({ v: String(v || ""), i })).filter(x => x.v);
  for (let i = 0; i < want.length; i += 1) {
    const { v, i: sortOrder } = want[i];
    const row = rows[i];
    const body = { deal: pbDealId, [fieldName]: v, sort_order: sortOrder, ...extra(v, sortOrder) };
    if (row) await updateRecord(collection, row.id, body);
    else await createRecord(collection, body);
  }
  for (let j = want.length; j < rows.length; j += 1) {
    await deleteRecord(collection, rows[j].id);
  }
}

async function syncSeekingSegments(pbDealId, segments) {
  await syncOrderedRows(pbDealId, "deal_seeking_segments", "segment_id", segments || []);
}

async function syncProjectTasks(pbDealId, tasks) {
  await syncOrderedRows(pbDealId, "deal_project_tasks", "task", tasks || []);
}

async function syncAsIsStack(pbDealId, stack) {
  const rows = await listAll("deal_as_is", { filter: `deal="${pbDealId}"` });
  const want = stack || {};
  const have = new Map(rows.map(r => [r.segment_id, r]));
  for (const [segId, raw] of Object.entries(want)) {
    const a = typeof raw === "object" ? raw : { vendor: String(raw || ""), custom: true };
    const body = {
      deal: pbDealId,
      segment_id: String(segId),
      vendor: a.vendor || "",
      product: a.product || "",
      catalog_key: a.catalogKey || "",
      comment: a.comment || "",
      custom: Boolean(a.custom),
    };
    const row = have.get(String(segId));
    if (row) await updateRecord("deal_as_is", row.id, body);
    else await createRecord("deal_as_is", body);
  }
  for (const row of rows) {
    if (!(row.segment_id in want)) await deleteRecord("deal_as_is", row.id);
  }
}

async function syncChangePains(pbDealId, pains) {
  const rows = await listAll("deal_change_pains", { filter: `deal="${pbDealId}"` });
  const want = pains || {};
  const have = new Map(rows.map(r => [r.segment_id, r]));
  for (const [segId, pain] of Object.entries(want)) {
    const body = { deal: pbDealId, segment_id: String(segId), pain_text: String(pain || "") };
    const row = have.get(String(segId));
    if (row) await updateRecord("deal_change_pains", row.id, body);
    else await createRecord("deal_change_pains", body);
  }
  for (const row of rows) {
    if (!(row.segment_id in want)) await deleteRecord("deal_change_pains", row.id);
  }
}

async function syncCompetitorEntries(pbDealId, entries) {
  const rows = await listAll("deal_competitors", { filter: `deal="${pbDealId}"`, sort: "sort_order" });
  const flat = [];
  for (const [segId, list] of Object.entries(entries || {})) {
    for (let i = 0; i < (list || []).length; i += 1) {
      const e = list[i];
      if (!e) continue;
      flat.push({
        segId: String(segId),
        sort_order: i,
        vendor: e.vendor || "",
        product: e.product || "",
        catalog_key: e.catalogKey || "",
        status: e.status || "evaluating",
        reject_reason: e.rejectReason || "",
        continue_reason: e.continueReason || "",
        comment: e.comment || "",
      });
    }
  }
  for (let i = 0; i < flat.length; i += 1) {
    const e = flat[i];
    const row = rows[i];
    const body = {
      deal: pbDealId,
      segment_id: e.segId,
      sort_order: e.sort_order,
      vendor: e.vendor,
      product: e.product,
      catalog_key: e.catalog_key,
      status: e.status,
      reject_reason: e.reject_reason,
      continue_reason: e.continue_reason,
      comment: e.comment,
    };
    if (row) await updateRecord("deal_competitors", row.id, body);
    else await createRecord("deal_competitors", body);
  }
  for (let j = flat.length; j < rows.length; j += 1) {
    await deleteRecord("deal_competitors", rows[j].id);
  }
}

/** Точечная синхронизация дочерних таблиц без delete-all. */
async function syncDealChildren(pbDealId, d) {
  const tr = d.techResearch || {};
  await syncRisks(pbDealId, d);
  await syncScores(pbDealId, d.scores, d.scoreReasons, d.scoresOverridden);
  await syncScoreHistory(pbDealId, d.scoreHistory);
  await syncDealTech(pbDealId, tr);
  await syncSeekingSegments(pbDealId, tr.seekingSegments);
  await syncProjectTasks(pbDealId, tr.projectTasks);
  await syncAsIsStack(pbDealId, tr.asIsStack);
  await syncChangePains(pbDealId, tr.changePains);
  await syncCompetitorEntries(pbDealId, tr.competitorEntries);
}

module.exports = { syncDealChildren };
