"use strict";

const { listAll, findOne, createRecord, updateRecord } = require("./pb-client");

const META_SLUG = "presale_deals";

let presaleCollectionOk = null;

async function presaleCollectionAvailable() {
  if (presaleCollectionOk !== null) return presaleCollectionOk;
  try {
    await listAll("presale_deals", { perPage: 1, fields: "id" });
    presaleCollectionOk = true;
  } catch {
    presaleCollectionOk = false;
  }
  return presaleCollectionOk;
}

async function loadPresaleMapFromCollection() {
  const rows = await listAll("presale_deals", { fields: "deal_id,data" });
  const map = {};
  for (const r of rows) {
    if (!r.deal_id) continue;
    try {
      map[r.deal_id] = typeof r.data === "object" && r.data !== null
        ? r.data
        : (r.data ? JSON.parse(r.data) : {});
    } catch {
      map[r.deal_id] = {};
    }
  }
  return map;
}

async function savePresaleMapToCollection(map) {
  const existing = await listAll("presale_deals", { fields: "id,deal_id" });
  const byDeal = Object.fromEntries(existing.map(r => [r.deal_id, r.id]));
  for (const [dealId, presale] of Object.entries(map || {})) {
    const body = {
      deal_id: dealId,
      data: presale || {},
    };
    const dealRow = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
    if (dealRow) body.deal = dealRow.id;
    if (byDeal[dealId]) await updateRecord("presale_deals", byDeal[dealId], body);
    else await createRecord("presale_deals", body);
  }
}

const PRESALE_FUNNEL_STAGES = [
  "Валидные клиенты на старте",
  "Функциональный голод до пилота",
  "Подготовка к пилоту",
  "В процессе пилота",
  "Ожидаем отчет по итогам",
  "Успех пилота",
  "Пауза",
  "Отказ",
];

const PRESALE_STAGES = [...PRESALE_FUNNEL_STAGES];

const PRESALE_LOSS_REASONS = [
  "Провал после демо (функциональный)",
  "Провал до пилота (не функциональный)",
  "Провал пилота (функциональный)",
];

const LEGACY_LOSS_STAGES = {
  "Провал после демо (функциональный)": "Провал после демо (функциональный)",
  "Провал до пилота (не функциональный)": "Провал до пилота (не функциональный)",
  "Провал пилота (функциональный)": "Провал пилота (функциональный)",
  "Успех без пилота": null,
};

const AMO_PRESALE_OWNER_ALIASES = {
  "гадир гадиров": "Гадиров Гадир",
  "гадиров гадир": "Гадиров Гадир",
  "иван лашин": "Иван Лашин",
  "трусов данила": "Трусов Данила",
  "данила трусов": "Трусов Данила",
};

/** false = не менять стадию менеджера */
const STAGE_MAP_PRESALE_TO_SALES = {
  "Валидные клиенты на старте": false,
  "Функциональный голод до пилота": false,
  "Подготовка к пилоту": "Подготовка Пилота",
  "В процессе пилота": "Пилот",
  "Ожидаем отчет по итогам": "Ожидаем отчет по итогам",
  "Успех пилота": "Пилот Окончен",
  "Пауза": "На паузе",
  "Отказ": "Отказ",
};

/** Менеджер → пре-сейл (только эти стадии синхронизируются с менеджера) */
const SALES_STAGES_SYNC_TO_PRESALE = {
  "Встреча состоялась": "Валидные клиенты на старте",
  "Интерес  Выявлен": "Валидные клиенты на старте",
  "Предложение выслано": "Валидные клиенты на старте",
  "Подготовка Пилота": "Подготовка к пилоту",
  "Пилот": "В процессе пилота",
  "Ожидаем отчет по итогам": "Ожидаем отчет по итогам",
  "На паузе": "Пауза",
};

const SALES_REJECT_MODES = {
  none: null,
  refusal: "Отказ",
  pilot_fail: "Провал пилота",
};

const STAGE_MAP_SALES_TO_PRESALE = {
  "Встреча состоялась": "Валидные клиенты на старте",
  "Интерес  Выявлен": "Валидные клиенты на старте",
  "Предложение выслано": "Валидные клиенты на старте",
  "Подготовка Пилота": "Подготовка к пилоту",
  "Пилот": "В процессе пилота",
  "Ожидаем отчет по итогам": "Ожидаем отчет по итогам",
  "Пилот Окончен": "Успех пилота",
  "На паузе": "Пауза",
};

function resolvePresaleStageFromSalesStage(salesStage) {
  const mapped = STAGE_MAP_SALES_TO_PRESALE[salesStage];
  if (mapped) return { stage: mapped };
  if (salesStage === "Провал пилота") {
    return { stage: PRESALE_STAGE_OTKAZ, salesRejectMode: "pilot_fail" };
  }
  if (salesStage === SALES_STAGE_SUCCESS_WITHOUT_PILOT) {
    return { stage: PRESALE_STAGE_SUCCESS, successWithoutPilot: true };
  }
  return null;
}

const SALES_STAGES_ENTER_PRESALE = Object.keys(STAGE_MAP_SALES_TO_PRESALE);

const LOSS_REQUIRES_COMMENT = new Set([
  "Провал пилота (функциональный)",
  "Провал до пилота (не функциональный)",
]);

const PRESALE_STAGE_OTKAZ = "Отказ";
const PRESALE_STAGE_SUCCESS = "Успех пилота";
const SALES_STAGE_SUCCESS_WITHOUT_PILOT = "Финальный компред";

function mapAmoPresaleOwner(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const key = s.toLowerCase();
  if (AMO_PRESALE_OWNER_ALIASES[key]) return AMO_PRESALE_OWNER_ALIASES[key];
  const known = ["Гадиров Гадир", "Иван Лашин", "Трусов Данила"];
  const exact = known.find(n => n.toLowerCase() === key);
  if (exact) return exact;
  if (known.includes(s)) return s;
  return "";
}

function inferPresaleOwnerFromDeal(deal) {
  const fromPresale = String(deal?.presale?.owner || "").trim();
  if (fromPresale) return fromPresale;
  return mapAmoPresaleOwner(deal?.capabilities);
}

function migratePresaleStageFields(presale) {
  const p = { ...(presale || {}) };
  const stage = String(p.stage || "").trim();
  if (LEGACY_LOSS_STAGES[stage]) {
    p.stage = PRESALE_STAGE_OTKAZ;
    if (!p.lossReason) p.lossReason = LEGACY_LOSS_STAGES[stage];
  } else if (stage === "Успех без пилота") {
    p.stage = PRESALE_STAGE_SUCCESS;
    p.successWithoutPilot = true;
  }
  return p;
}

function resolvePresaleStageFromDeal(deal, presale) {
  const p = migratePresaleStageFields(presale || {});
  if (p.stage) return p.stage;
  return STAGE_MAP_SALES_TO_PRESALE[deal?.stage || ""] || null;
}

async function loadPresaleMap() {
  if (!(await presaleCollectionAvailable())) {
    throw new Error("Коллекция presale_deals недоступна");
  }
  return loadPresaleMapFromCollection();
}

async function savePresaleMap(map) {
  if (!(await presaleCollectionAvailable())) {
    throw new Error("Коллекция presale_deals недоступна");
  }
  await savePresaleMapToCollection(map);
}

function defaultPresaleBlock(deal) {
  return {
    stage: "",
    owner: inferPresaleOwnerFromDeal(deal) || "",
    successWithoutPilot: false,
    pilotStart: "",
    pilotEnd: "",
    distroIssueDate: "",
    distroEndDate: "",
    lossReason: "",
    lossComment: "",
    salesRejectMode: "none",
    kaitenCardId: null,
    kaitenCardUrl: "",
    kaitenSyncedAt: "",
    kaitenSyncError: "",
    kaitenRemoteUpdatedAt: "",
    kaitenSyncedCommentIds: [],
    kaitenSyncedFileIds: [],
    kaitenDescriptionSynced: false,
    events: [],
  };
}

function normalizePresale(raw, deal, opts = {}) {
  const base = defaultPresaleBlock(deal);
  const ignoreRow = Boolean(opts?.ignoreRow);
  const rowStage = ignoreRow ? "" : String(deal?.presale_stage || "").trim();
  const rowOwner = ignoreRow ? "" : String(deal?.presale_owner || "").trim();
  if (!raw || typeof raw !== "object") {
    return migratePresaleStageFields({
      ...base,
      stage: rowStage || base.stage || "",
      owner: rowOwner || base.owner || "",
    });
  }
  return migratePresaleStageFields({
    ...base,
    ...raw,
    stage: rowStage || raw.stage || "",
    owner: rowOwner || raw.owner || base.owner || inferPresaleOwnerFromDeal(deal) || "",
    successWithoutPilot: Boolean(raw.successWithoutPilot),
    events: Array.isArray(raw.events) ? raw.events : [],
  });
}

async function syncPresaleFieldsToDealRow(dealId, { stage, owner } = {}) {
  if (!dealId) return;
  const row = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
  if (!row) return;
  const patch = {};
  if (stage !== undefined) patch.presale_stage = String(stage || "").trim();
  if (owner !== undefined) patch.presale_owner = String(owner || "").trim();
  if (!Object.keys(patch).length) return;
  await updateRecord("deals", row.id, patch);
}

async function getPresaleForDeal(dealId, deal) {
  if (!dealId) return null;
  const map = await loadPresaleMap();
  const row = deal || null;
  return normalizePresale(map[dealId], row);
}

async function savePresaleForDeal(dealId, presale, deal) {
  if (!dealId) throw new Error("dealId required");
  const map = await loadPresaleMap();
  const prev = normalizePresale(map[dealId], deal);
  const next = normalizePresale({ ...prev, ...(presale || {}), updatedAt: new Date().toISOString() }, deal);
  map[dealId] = next;
  await savePresaleMap(map);
  return next;
}

async function mergePresaleIntoDeals(deals) {
  const map = await loadPresaleMap();
  return (deals || []).map(d => ({
    ...d,
    presale: normalizePresale(map[d.id] || d.presale, d),
  }));
}

function validatePresalePatch(presale) {
  const stage = presale?.stage || "";
  if (stage === PRESALE_STAGE_OTKAZ) {
    const reason = String(presale?.lossReason || "").trim();
    if (!reason || !PRESALE_LOSS_REASONS.includes(reason)) {
      const err = new Error("Укажите причину отказа пре-сейла");
      err.status = 400;
      throw err;
    }
    if (LOSS_REQUIRES_COMMENT.has(reason) && !String(presale?.lossComment || "").trim()) {
      const err = new Error("Укажите описание причины отказа");
      err.status = 400;
      throw err;
    }
  }
  if (stage && !PRESALE_STAGES.includes(stage) && !LEGACY_LOSS_STAGES[stage]) {
    const err = new Error(`Неизвестный этап пре-сейла: ${stage}`);
    err.status = 400;
    throw err;
  }
}

async function applySuccessWithoutPilot(dealId, presale, { savedBy = "presale" } = {}) {
  const { loadPipelineState, saveSingleDeal } = require("./mapper");
  const { addActivity } = require("./deal-crm");

  const deal = await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) return null;

  const msg = "Успех без пилота";
  if (deal.stage !== SALES_STAGE_SUCCESS_WITHOUT_PILOT) {
    const { saved } = await saveSingleDeal(
      { ...deal, stage: SALES_STAGE_SUCCESS_WITHOUT_PILOT },
      { savedBy, isNew: false }
    );
    await addActivity(dealId, { type: "stage_change", body: `${deal.stage || "—"} → ${SALES_STAGE_SUCCESS_WITHOUT_PILOT} (${msg})`, author: savedBy });
    await addActivity(dealId, { type: "comment", body: msg, author: savedBy });
    return saved;
  }
  await addActivity(dealId, { type: "comment", body: msg, author: savedBy });
  return deal;
}

async function syncSalesStageFromPresale(dealId, presale, { savedBy = "presale" } = {}) {
  const { loadPipelineState, saveSingleDeal } = require("./mapper");
  const { addActivity } = require("./deal-crm");

  if (presale?.successWithoutPilot && presale?.stage === PRESALE_STAGE_SUCCESS) {
    return applySuccessWithoutPilot(dealId, presale, { savedBy });
  }

  const stage = presale?.stage || "";
  if (!stage) return null;

  if (stage === PRESALE_STAGE_OTKAZ) {
    const mode = presale.salesRejectMode || "none";
    const mapped = SALES_REJECT_MODES[mode];
    if (!mapped) return null;
    const deal = await loadPipelineState({ dealId, includeArchived: true });
    if (!deal) return null;
    const patch = { ...deal, stage: mapped };
    if (mapped === "Отказ") {
      patch.lossReason = presale.lossReason || deal.lossReason || "";
      if (presale.lossComment) patch.lossComment = presale.lossComment;
    }
    if (deal.stage === patch.stage && deal.lossReason === patch.lossReason) return deal;
    const { saved } = await saveSingleDeal(patch, { savedBy, isNew: false });
    await addActivity(dealId, { type: "stage_change", body: `${deal.stage || "—"} → ${saved.stage}`, author: savedBy });
    if (mapped === "Отказ" && patch.lossReason) {
      await addActivity(dealId, { type: "loss_reason", body: `Причина отказа: ${patch.lossReason}`, author: savedBy });
    }
    return saved;
  }

  const mapped = STAGE_MAP_PRESALE_TO_SALES[stage];
  if (mapped === false || mapped == null) return null;

  const deal = await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) return null;

  const patch = { ...deal, stage: mapped };
  if (mapped === "Отказ") {
    patch.lossReason = presale.lossReason || deal.lossReason || "";
    if (presale.lossComment) patch.lossComment = presale.lossComment;
  }
  if (deal.stage === patch.stage && deal.lossReason === patch.lossReason) return deal;

  const { saved } = await saveSingleDeal(patch, { savedBy, isNew: false });
  await addActivity(dealId, { type: "stage_change", body: `${deal.stage || "—"} → ${saved.stage}`, author: savedBy });
  if (mapped === "Отказ" && patch.lossReason) {
    await addActivity(dealId, { type: "loss_reason", body: `Причина отказа: ${patch.lossReason}`, author: savedBy });
  }
  return saved;
}

async function syncPresaleFromSalesStage(dealId, oldStage, newStage, { savedBy = "manager" } = {}) {
  const presaleStage = SALES_STAGES_SYNC_TO_PRESALE[newStage];
  if (!presaleStage) return null;

  const { loadPipelineState } = require("./mapper");
  const deal = await loadPipelineState({ dealId, includeArchived: true });
  const map = await loadPresaleMap();
  const prev = normalizePresale(map[dealId], deal);
  if (presaleStage === prev.stage) return prev;

  const next = {
    ...prev,
    stage: presaleStage,
    updatedAt: new Date().toISOString(),
  };
  if (presaleStage !== PRESALE_STAGE_OTKAZ && prev.successWithoutPilot) {
    next.successWithoutPilot = false;
  }

  map[dealId] = next;
  await savePresaleMap(map);
  await syncPresaleFieldsToDealRow(dealId, { stage: next.stage, owner: next.owner });

  await addPresaleEvent(dealId, {
    type: "presale_stage_change",
    body: `${prev.stage || "—"} → ${next.stage}`,
    author: savedBy,
    meta: { from: prev.stage || "", to: next.stage },
  });

  try {
    const { ensureKaitenCardForDeal } = require("./kaiten-sync");
    next = await ensureKaitenCardForDeal(dealId, deal, next, { savedBy });
    map[dealId] = next;
    await savePresaleMap(map);
  } catch (e) {
    console.warn("kaiten sync from sales", dealId, e.message);
  }

  return next;
}

async function addPresaleEvent(dealId, event, { skipKaitenComment = false } = {}) {
  const map = await loadPresaleMap();
  const presale = normalizePresale(map[dealId]);
  const row = {
    id: `pe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: event?.at || new Date().toISOString(),
    type: event?.type || "comment",
    body: String(event?.body || "").trim(),
    author: String(event?.author || "").trim(),
    meta: event?.meta || {},
  };
  if (!row.body) throw new Error("Пустой текст записи");
  presale.events = [row, ...(presale.events || [])].slice(0, 500);
  presale.updatedAt = new Date().toISOString();
  map[dealId] = presale;
  await savePresaleMap(map);
  if (!skipKaitenComment && !event?.meta?.fromKaiten) {
    try {
      const { syncCommentToKaiten } = require("./kaiten-sync");
      await syncCommentToKaiten(dealId, presale, row);
    } catch (e) {
      console.warn("kaiten comment sync", dealId, e.message);
    }
  }
  return row;
}

async function patchPresaleDeal(dealId, patch, { savedBy = "presale", syncSales = true, skipKaiten = false, deal: dealHint } = {}) {
  const { loadPipelineState } = require("./mapper");
  const { addActivity } = require("./deal-crm");
  const deal = dealHint || await loadPipelineState({ dealId, includeArchived: true });

  let body = { ...(patch || {}) };
  if (body.successWithoutPilot === true) {
    body.stage = PRESALE_STAGE_SUCCESS;
    body.successWithoutPilot = true;
  } else if (body.successWithoutPilot === false) {
    body.successWithoutPilot = false;
  }

  body = migratePresaleStageFields(body);
  if (body.owner !== undefined && String(body.owner || "").trim()) {
    const { resolveCrmOwnerName } = require("./kaiten-owners");
    body.owner = resolveCrmOwnerName(body.owner);
  }
  validatePresalePatch(body);

  const map = await loadPresaleMap();
  const prev = normalizePresale(map[dealId], deal);
  let next = normalizePresale(
    { ...prev, ...body, updatedAt: new Date().toISOString() },
    deal,
    { ignoreRow: true },
  );
  if (next.stage && next.stage !== PRESALE_STAGE_SUCCESS && next.successWithoutPilot) {
    next.successWithoutPilot = false;
  }
  map[dealId] = next;
  await savePresaleMap(map);
  await syncPresaleFieldsToDealRow(dealId, { stage: next.stage, owner: next.owner });

  if (next.stage && next.stage !== prev.stage) {
    await addPresaleEvent(dealId, {
      type: "presale_stage_change",
      body: `${prev.stage || "—"} → ${next.stage}`,
      author: savedBy,
      meta: { from: prev.stage || "", to: next.stage },
    });
    await addActivity(dealId, {
      type: "field_change",
      body: `Стадия пре-сейл: ${prev.stage || "—"} → ${next.stage}`,
      author: savedBy,
      meta: { presale: true, field: "stage" },
    });
  }

  const PRESALE_AUDIT_FIELDS = {
    owner: "Ответственный пре-сейл",
    pilotStart: "Начало пилота",
    pilotEnd: "Окончание пилота",
    distroIssueDate: "Дата выдачи дистрибутива",
    distroEndDate: "Окончание дистрибутива",
    lossReason: "Причина отказа (пре-сейл)",
    lossComment: "Комментарий к отказу",
  };
  for (const [key, label] of Object.entries(PRESALE_AUDIT_FIELDS)) {
    if (patch[key] === undefined) continue;
    const ov = String(prev[key] || "").trim();
    const nv = String(next[key] || "").trim();
    if (ov === nv) continue;
    await addActivity(dealId, {
      type: "field_change",
      body: `${label}: ${ov || "—"} → ${nv || "—"}`,
      author: savedBy,
      meta: { presale: true, field: key },
    });
  }

  if (next.successWithoutPilot) {
    await addPresaleEvent(dealId, { type: "system", body: "Успех без пилота", author: savedBy });
  }

  if (syncSales) {
    await syncSalesStageFromPresale(dealId, next, { savedBy });
  }

  if (!skipKaiten) {
    try {
      const { ensureKaitenCardForDeal } = require("./kaiten-sync");
      const refreshedDeal = await loadPipelineState({ dealId, includeArchived: true });
      next = await ensureKaitenCardForDeal(dealId, refreshedDeal, next, { savedBy });
      map[dealId] = next;
      await savePresaleMap(map);
    } catch (e) {
      console.warn("kaiten sync", dealId, e.message);
    }
  }

  return next;
}

async function backfillPresaleFromDeals() {
  const { listAll } = require("./pb-client");
  const dealRows = await listAll("deals", { sort: "deal_id" });
  const map = await loadPresaleMap();
  let changed = 0;

  for (const row of dealRows) {
    const dealId = row.deal_id;
    if (!dealId) continue;
    const deal = {
      id: dealId,
      stage: row.stage || "",
      capabilities: row.capabilities || "",
      lossReason: row.loss_reason || "",
    };
    const prev = normalizePresale(map[dealId], deal);
    const next = { ...prev };
    let touched = false;

    const owner = inferPresaleOwnerFromDeal({ presale: prev, capabilities: deal.capabilities });
    if (owner && owner !== prev.owner) {
      next.owner = owner;
      touched = true;
    }

    if (!next.stage) {
      const resolved = resolvePresaleStageFromSalesStage(deal.stage);
      if (resolved?.stage) {
        next.stage = resolved.stage;
        if (resolved.salesRejectMode) next.salesRejectMode = resolved.salesRejectMode;
        if (resolved.successWithoutPilot) next.successWithoutPilot = true;
        touched = true;
      }
    }

    if (!next.owner && row.presale_owner) {
      next.owner = String(row.presale_owner).trim();
      touched = true;
    }
    if (!next.stage && row.presale_stage) {
      next.stage = String(row.presale_stage).trim();
      touched = true;
    }

    const migrated = migratePresaleStageFields(next);
    if (migrated.stage !== next.stage || migrated.lossReason !== next.lossReason || migrated.successWithoutPilot !== next.successWithoutPilot) {
      Object.assign(next, migrated);
      touched = true;
    }

    if (touched) {
      next.updatedAt = new Date().toISOString();
      map[dealId] = next;
      changed++;
    }

    const rowStage = String(row.presale_stage || "").trim();
    const rowOwner = String(row.presale_owner || "").trim();
    if ((next.stage && rowStage !== next.stage) || (next.owner && rowOwner !== next.owner)) {
      try {
        await syncPresaleFieldsToDealRow(dealId, { stage: next.stage, owner: next.owner });
        if (!touched) changed++;
      } catch (e) {
        console.warn("backfill syncPresaleFieldsToDealRow", dealId, e.message);
      }
    }
  }

  if (changed) await savePresaleMap(map);
  return { changed, total: dealRows.length };
}

module.exports = {
  PRESALE_STAGES,
  PRESALE_FUNNEL_STAGES,
  PRESALE_LOSS_REASONS,
  STAGE_MAP_PRESALE_TO_SALES,
  STAGE_MAP_SALES_TO_PRESALE,
  SALES_STAGES_SYNC_TO_PRESALE,
  loadPresaleMap,
  savePresaleForDeal,
  getPresaleForDeal,
  mergePresaleIntoDeals,
  patchPresaleDeal,
  addPresaleEvent,
  syncSalesStageFromPresale,
  syncPresaleFromSalesStage,
  validatePresalePatch,
  resolvePresaleStageFromDeal,
  backfillPresaleFromDeals,
  syncPresaleFieldsToDealRow,
  inferPresaleOwnerFromDeal,
  savePresaleMap,
  normalizePresale,
  resolvePresaleStageFromSalesStage,
};
