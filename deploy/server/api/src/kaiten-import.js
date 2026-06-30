"use strict";

const { loadPipelineState } = require("./mapper");
const { loadPresaleMap, savePresaleMap, normalizePresale, patchPresaleDeal, addPresaleEvent } = require("./presale-data");
const { cardUrl } = require("./kaiten-config");
const { syncDealToKaiten, dealInPresaleFunnel } = require("./kaiten-sync");
const { getCard } = require("./kaiten-client");
const {
  resolveCrmOwnerFromKaitenUserId,
  resolveCrmOwnerName,
  readResponsibleUserId,
} = require("./kaiten-owners");
const { backfillCardToCrm } = require("./kaiten-inbound");

async function linkKaitenCardToDeal(dealId, cardId, { crmWins = true, force = false } = {}) {
  const map = await loadPresaleMap();
  const deal = await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  const prev = normalizePresale(map[dealId], deal);
  const cardIdNum = Number(cardId);
  if (!cardIdNum) throw new Error("Invalid cardId");

  const dup = Object.entries(map).find(([id, p]) => id !== dealId && String(p?.kaitenCardId) === String(cardIdNum));
  if (dup && !force) throw new Error(`Card ${cardIdNum} already linked to ${dup[0]}. Use force.`);
  if (dup && force) {
    map[dup[0]] = {
      ...normalizePresale(map[dup[0]]),
      kaitenCardId: null,
      kaitenCardUrl: "",
      updatedAt: new Date().toISOString(),
    };
  }

  const next = {
    ...prev,
    kaitenCardId: cardIdNum,
    kaitenCardUrl: cardUrl(cardIdNum),
    kaitenSyncedAt: new Date().toISOString(),
    kaitenSyncError: "",
    kaitenSyncedCommentIds: [],
    kaitenSyncedFileIds: [],
    kaitenDescriptionSynced: false,
    updatedAt: new Date().toISOString(),
  };
  map[dealId] = next;
  await savePresaleMap(map);
  await addPresaleEvent(dealId, {
    type: "system",
    body: `Привязана карточка Kaiten #${cardIdNum}`,
    author: "kaiten-import",
    meta: { kaitenCardId: cardIdNum },
  }, { skipKaitenComment: true });

  if (crmWins) await syncDealToKaiten(dealId, deal, next, { savedBy: "kaiten-import" });
  return next;
}

async function createKaitenCardForDeal(dealId, { crmWins = true } = {}) {
  const deal = await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) throw new Error(`Deal not found: ${dealId}`);
  const map = await loadPresaleMap();
  const presale = normalizePresale(map[dealId], deal);
  if (!dealInPresaleFunnel(deal, presale)) throw new Error(`Deal ${dealId} not in presale funnel`);
  const next = await syncDealToKaiten(dealId, deal, presale, { savedBy: "kaiten-import" });
  return next;
}

async function applyImportRow(row) {
  const dealId = row.dealId;
  const deal = await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) return { dealId, status: "missing_deal" };

  let presale = normalizePresale((await loadPresaleMap())[dealId], deal);
  let cardId = row.cardId ? Number(row.cardId) : null;

  if (row.action === "create" || !cardId) {
    presale = await createKaitenCardForDeal(dealId, { crmWins: true });
    cardId = presale.kaitenCardId;
  } else {
    presale = await linkKaitenCardToDeal(dealId, cardId, { crmWins: true, force: true });
  }

  const ownerPatch = {};
  if (row.forceOwner) {
    ownerPatch.owner = resolveCrmOwnerName(row.forceOwner);
  } else if (!String(presale.owner || "").trim() && cardId) {
    const card = await getCard(cardId);
    const fromKaiten = resolveCrmOwnerFromKaitenUserId(readResponsibleUserId(card));
    if (fromKaiten) ownerPatch.owner = fromKaiten;
  }

  if (Object.keys(ownerPatch).length) {
    presale = await patchPresaleDeal(dealId, ownerPatch, {
      savedBy: "kaiten-import",
      syncSales: false,
      skipKaiten: false,
      deal,
    });
  } else if (cardId) {
    await syncDealToKaiten(dealId, deal, presale, { savedBy: "kaiten-import" });
  }

  const card = cardId ? await getCard(cardId) : null;
  const backfill = cardId
    ? await backfillCardToCrm(dealId, cardId, presale, card, { reset: Boolean(row.resetBackfill) })
    : null;

  return { dealId, status: "ok", cardId, ownerPatch, backfill };
}

async function applyImportPlan(plan) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : plan;
  const results = { ok: 0, errors: 0, details: [] };
  for (const row of rows) {
    try {
      const r = await applyImportRow(row);
      results.ok++;
      results.details.push(r);
    } catch (e) {
      results.errors++;
      results.details.push({ dealId: row.dealId, status: "error", error: String(e.message || e) });
    }
  }
  return results;
}

module.exports = {
  linkKaitenCardToDeal,
  createKaitenCardForDeal,
  applyImportRow,
  applyImportPlan,
};
