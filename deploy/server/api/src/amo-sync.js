"use strict";

const { getAccessToken, amoGetAll } = require("./amo-client");
const { getPipelinesConfig, savePipelinesConfig } = require("./pipelines-config");
const { syncLeadFromAmo, findDealRowByAmoId, syncLeadNotesAndTasks } = require("./amo-lead-sync");
const { resolveCrmPersonFromAmo } = require("./amo-users");
const { findOne, createRecord, updateRecord, listAll } = require("./pb-client");

const META_SLUG = "amo_sync";
const CUTOFF_ISO = "2026-06-29T23:59:59+00:00";
const SKIP_STAGE_NAMES = new Set(["непроработанные"]);
const MISSING_SCAN_INTERVAL_MS = 30 * 60 * 1000;

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/ё/g, "е");
}

function isSkipStageName(name) {
  const n = norm(name);
  if (SKIP_STAGE_NAMES.has(n)) return true;
  if (/^непроработан/.test(n)) return true;
  if (n === "отказ" || /^отказ(\s|$)/.test(n)) return true;
  if (/успех|успешно реализован|успешно/.test(n)) return true;
  if (/закрыт|won|lost/.test(n)) return true;
  return false;
}

function shouldSyncLead(lead, stageName, pipelineCfg) {
  if (!lead || !pipelineCfg?.syncEnabled) return false;
  return !isSkipStageName(stageName);
}

async function loadSyncMeta() {
  const row = await findOne("pipeline_meta", `slug="${META_SLUG}"`);
  if (!row) return { lastPollAt: null, lastMissingScanAt: null, stageMap: {}, pipelineStageMap: {} };
  let extra = {};
  try { extra = JSON.parse(row.focus_risk || "{}"); } catch (_) { /* ignore */ }
  return {
    lastPollAt: row.saved_at || null,
    lastMissingScanAt: extra.lastMissingScanAt || null,
    notesBackfillOffset: extra.notesBackfillOffset || 0,
    stageMap: extra.stageMap || {},
    pipelineStageMap: extra.pipelineStageMap || {},
  };
}

async function saveSyncMeta(patch) {
  const existing = await findOne("pipeline_meta", `slug="${META_SLUG}"`);
  const prev = existing ? await loadSyncMeta() : {
    lastPollAt: null, lastMissingScanAt: null, stageMap: {}, pipelineStageMap: {},
  };
  const body = {
    slug: META_SLUG,
    saved_at: patch.lastPollAt || new Date().toISOString(),
    focus_risk: JSON.stringify({
      stageMap: patch.stageMap || prev.stageMap,
      pipelineStageMap: patch.pipelineStageMap || prev.pipelineStageMap,
      lastMissingScanAt: patch.lastMissingScanAt ?? prev.lastMissingScanAt,
      notesBackfillOffset: patch.notesBackfillOffset ?? prev.notesBackfillOffset,
      lastResult: patch.lastResult || null,
    }),
  };
  if (existing) await updateRecord("pipeline_meta", existing.id, body);
  else await createRecord("pipeline_meta", body);
}

async function loadAmoStageMaps(token, pipelines) {
  const pipelineStageMap = {};
  const stageMap = {};
  const amoPipelines = await amoGetAll("/api/v4/leads/pipelines", token);
  for (const p of amoPipelines) {
    const cfg = pipelines.find(x => {
      if (x.amoPipelineId && Number(x.amoPipelineId) === Number(p.id)) return true;
      if (x.amoPipelineName && norm(p.name) === norm(x.amoPipelineName)) return true;
      return false;
    });
    if (!cfg) continue;
    cfg.amoPipelineId = p.id;
    pipelineStageMap[String(p.id)] = { crmPipelineId: cfg.id, name: p.name };
    for (const st of p._embedded?.statuses || []) {
      stageMap[`${p.id}:${st.id}`] = {
        name: st.name,
        crmStage: st.name,
        pipelineId: cfg.id,
      };
    }
  }
  return { pipelineStageMap, stageMap, pipelines };
}

async function syncPipelineStagesToLists(stageMap, pipelines) {
  const { syncStagesList } = require("./kanban-config");
  const { CANONICAL_SALES_STAGES } = require("./sales-stages");
  const byPipeline = {};
  for (const [key, st] of Object.entries(stageMap)) {
    const pid = String(key.split(":")[0]);
    if (!byPipeline[pid]) byPipeline[pid] = [];
    const name = String(st.name || "").trim();
    if (name && !byPipeline[pid].includes(name)) byPipeline[pid].push(name);
  }
  for (const pipe of pipelines) {
    if (!pipe.amoPipelineId || !pipe.stagesListKey) continue;
    if (pipe.stagesListKey === "stages") {
      await syncStagesList([...CANONICAL_SALES_STAGES], "stages");
      continue;
    }
    const raw = byPipeline[String(pipe.amoPipelineId)] || [];
    const names = raw.filter(n => !isSkipStageName(n));
    if (names.length) await syncStagesList(names, pipe.stagesListKey);
  }
}

async function loadKnownAmoIds() {
  const rows = await listAll("deals", { fields: "amo_id" });
  const set = new Set();
  for (const row of rows) {
    const id = Number(row.amo_id);
    if (id > 0) set.add(id);
  }
  return set;
}

async function processLead({ lead, token, pipe, stageMap, stats, knownAmoIds }) {
  stats.checked += 1;
  const stKey = `${lead.pipeline_id}:${lead.status_id}`;
  const st = stageMap[stKey] || { name: "", crmStage: "" };
  const existing = await findDealRowByAmoId(lead.id);
  if (!shouldSyncLead(lead, st.name, pipe)) {
    if (existing && (pipe.id === "sales" || pipe.type === "reference")) {
      try {
        await syncLeadNotesAndTasks({
          lead,
          token,
          dealId: existing.deal_id,
          pbId: existing.id,
        });
        if (pipe.type === "reference") {
          const amoOwner = await resolveCrmPersonFromAmo(lead.responsible_user_id, token, { defaultIfMissing: true });
          if (amoOwner && amoOwner !== existing.owner) {
            await updateRecord("deals", existing.id, { owner: amoOwner });
          }
        }
      } catch (e) {
        console.warn("amo notes backfill skipped lead", lead.id, e.message);
      }
    }
    stats.skipped += 1;
    return;
  }
  try {
    const result = await syncLeadFromAmo({
      lead,
      token,
      pipeline: pipe,
      stageName: st.name,
      crmStage: st.crmStage || st.name,
    });
    if (result.created) stats.created += 1;
    if (result.synced) {
      stats.synced += 1;
      knownAmoIds.add(Number(lead.id));
    } else stats.skipped += 1;
  } catch (e) {
    stats.errors += 1;
    console.error("amo sync lead", lead.id, e.message);
  }
}

async function syncMissingLeads({ token, pipe, stageMap, knownAmoIds, stats }) {
  if (!pipe.amoPipelineId) return;
  const leads = await amoGetAll("/api/v4/leads", token, {
    "filter[pipeline_id]": pipe.amoPipelineId,
    with: "contacts",
  });
  for (const lead of leads) {
    if (knownAmoIds.has(Number(lead.id))) continue;
    await processLead({ lead, token, pipe, stageMap, stats, knownAmoIds });
  }
}

async function syncUpdatedLeads({ token, pipe, stageMap, sinceUnix, stats, knownAmoIds }) {
  if (!pipe.amoPipelineId) return;
  const leads = await amoGetAll("/api/v4/leads", token, {
    "filter[pipeline_id]": pipe.amoPipelineId,
    "filter[updated_at][from]": sinceUnix,
    with: "contacts",
  });
  for (const lead of leads) {
    await processLead({ lead, token, pipe, stageMap, stats, knownAmoIds });
  }
}

async function backfillNotesTasksRotating({ token, offset = 0, batchSize = 25 }) {
  const deals = await listAll("deals", {
    filter: "amo_id>0",
    fields: "id,deal_id,amo_id,archived",
    sort: "deal_id",
  });
  const rows = deals.filter(d => !d.archived && Number(d.amo_id) > 0);
  if (!rows.length) return offset;
  let nextOffset = offset;
  for (let i = 0; i < batchSize; i++) {
    const row = rows[nextOffset % rows.length];
    nextOffset += 1;
    if (!row) continue;
    try {
      const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": row.amo_id, with: "contacts" });
      const lead = leads[0];
      if (!lead) continue;
      await syncLeadNotesAndTasks({
        lead,
        token,
        dealId: row.deal_id,
        pbId: row.id,
      });
    } catch (e) {
      console.warn("amo notes rotate backfill", row.deal_id, e.message);
    }
  }
  return nextOffset % rows.length;
}

async function pollAmoInbound({ forceMissingScan = false } = {}) {
  const started = new Date().toISOString();
  const token = await getAccessToken();
  const cfg = await getPipelinesConfig();
  const pipelines = (cfg.pipelines || []).filter(p => p.syncEnabled);
  if (!pipelines.length) {
    return { ok: false, error: "no_sync_pipelines_configured", started };
  }

  const meta = await loadSyncMeta();
  let { stageMap, pipelineStageMap } = meta;
  let resolvedPipelines = pipelines;
  if (!Object.keys(stageMap).length) {
    const maps = await loadAmoStageMaps(token, pipelines);
    stageMap = maps.stageMap;
    pipelineStageMap = maps.pipelineStageMap;
    resolvedPipelines = maps.pipelines;
    await syncPipelineStagesToLists(stageMap, resolvedPipelines);
    await savePipelinesConfig(
      (cfg.pipelines || []).map(p => {
        const hit = resolvedPipelines.find(r => r.id === p.id);
        return hit?.amoPipelineId ? { ...p, amoPipelineId: hit.amoPipelineId } : p;
      }),
    );
  }

  const since = meta.lastPollAt || new Date(Date.now() - 3600_000).toISOString();
  const sinceUnix = Math.floor(new Date(since).getTime() / 1000);
  const stats = {
    checked: 0, synced: 0, skipped: 0, errors: 0, created: 0, missingScan: false,
  };

  const knownAmoIds = await loadKnownAmoIds();
  const needMissingScan = forceMissingScan
    || !meta.lastMissingScanAt
    || (Date.now() - Date.parse(meta.lastMissingScanAt) > MISSING_SCAN_INTERVAL_MS);

  if (needMissingScan) {
    stats.missingScan = true;
    for (const pipe of resolvedPipelines) {
      await syncMissingLeads({ token, pipe, stageMap, knownAmoIds, stats });
    }
  }

  for (const pipe of resolvedPipelines) {
    await syncUpdatedLeads({ token, pipe, stageMap, sinceUnix, stats, knownAmoIds });
  }

  const notesBackfillOffset = await backfillNotesTasksRotating({
    token,
    offset: meta.notesBackfillOffset || 0,
    batchSize: 30,
  });

  const lastResult = { ...stats, started, finished: new Date().toISOString() };
  await saveSyncMeta({
    lastPollAt: lastResult.finished,
    lastMissingScanAt: needMissingScan ? lastResult.finished : meta.lastMissingScanAt,
    notesBackfillOffset,
    stageMap,
    pipelineStageMap,
    lastResult,
  });
  return { ok: true, ...lastResult };
}

module.exports = {
  pollAmoInbound,
  shouldSyncLead,
  isSkipStageName,
  loadSyncMeta,
  CUTOFF_ISO,
};
