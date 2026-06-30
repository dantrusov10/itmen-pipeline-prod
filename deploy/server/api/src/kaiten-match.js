"use strict";

const { listAll } = require("./pb-client");
const { loadPipelineState } = require("./mapper");
const { loadPresaleMap, savePresaleMap, normalizePresale, addPresaleEvent } = require("./presale-data");
const { listBoardCards } = require("./kaiten-client");
const { cardUrl, normalizePersonName } = require("./kaiten-config");
const { syncDealToKaiten, buildCardTitle } = require("./kaiten-sync");

function normalizeTitle(s) {
  return String(s || "").trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}

function extractDealId(text) {
  const m = String(text || "").match(/\bD-\d+\b/i);
  return m ? m[0].toUpperCase() : "";
}

function scoreMatch(deal, card, presale) {
  const title = String(card?.title || "");
  const desc = String(card?.description || "");
  const dealIdFromCard = extractDealId(title) || extractDealId(desc);
  if (dealIdFromCard && dealIdFromCard === deal.id) return 100;

  const customer = normalizeTitle(deal.customer);
  const cardTitle = normalizeTitle(title);
  if (customer && cardTitle.includes(customer)) return 80;
  if (customer && normalizeTitle(cardTitle.replace(extractDealId(title), "")).includes(customer)) return 75;

  const owner = normalizePersonName(presale?.owner);
  const cardOwner = normalizePersonName(card?.owner?.full_name || card?.owner?.name || "");
  if (owner && cardOwner && owner === cardOwner && customer && cardTitle.includes(customer.slice(0, 20))) return 60;
  return 0;
}

async function matchKaitenCardsToDeals({ crmWins = true, dryRun = false } = {}) {
  const [deals, cardsRaw, presaleMap] = await Promise.all([
    listAll("deals", { sort: "deal_id" }),
    listBoardCards(500),
    loadPresaleMap(),
  ]);
  const cards = Array.isArray(cardsRaw) ? cardsRaw : (cardsRaw?.cards || cardsRaw?.items || []);

  const results = { matched: 0, skipped: 0, ambiguous: 0, unmatchedCards: 0, details: [] };

  for (const row of deals) {
    const dealId = row.deal_id;
    if (!dealId) continue;
    const deal = await loadPipelineState({ dealId, includeArchived: true });
    if (!deal) continue;
    const presale = normalizePresale(presaleMap[dealId], deal);
    if (presale.kaitenCardId) {
      results.skipped++;
      continue;
    }

    const scored = cards
      .map(c => ({ card: c, score: scoreMatch(deal, c, presale) }))
      .filter(x => x.score >= 60)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) continue;
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      results.ambiguous++;
      results.details.push({ dealId, status: "ambiguous", candidates: scored.slice(0, 3).map(s => s.card.id) });
      continue;
    }

    const card = scored[0].card;
    const cardId = card.id;
    const next = {
      ...presale,
      kaitenCardId: cardId,
      kaitenCardUrl: cardUrl(cardId),
      kaitenSyncedAt: new Date().toISOString(),
      kaitenSyncError: "",
      updatedAt: new Date().toISOString(),
    };
    if (!dryRun) {
      presaleMap[dealId] = next;
      await addPresaleEvent(dealId, {
        type: "system",
        body: `Привязана карточка Kaiten #${cardId}`,
        author: "kaiten-match",
        meta: { kaitenCardId: cardId },
      });
      if (crmWins) {
        await syncDealToKaiten(dealId, deal, next, { savedBy: "kaiten-match" });
      }
    }
    results.matched++;
    results.details.push({ dealId, status: "matched", cardId, score: scored[0].score });
  }

  if (!dryRun) await savePresaleMap(presaleMap);

  const matchedCardIds = new Set(
    Object.values(presaleMap).map(p => p?.kaitenCardId).filter(Boolean).map(String),
  );
  results.unmatchedCards = cards.filter(c => !matchedCardIds.has(String(c.id))).length;

  return results;
}

module.exports = { matchKaitenCardsToDeals, scoreMatch, extractDealId };
