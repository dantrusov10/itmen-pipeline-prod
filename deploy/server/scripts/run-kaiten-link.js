#!/usr/bin/env node
"use strict";

const fs = require("fs");
const envPath = "/opt/itmen-pipeline/.env";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { loadPipelineState } = require("../api/src/mapper");
const { loadPresaleMap, savePresaleMap, normalizePresale, addPresaleEvent } = require("../api/src/presale-data");
const { cardUrl } = require("../api/src/kaiten-config");
const { syncDealToKaiten } = require("../api/src/kaiten-sync");

async function linkKaitenCardToDeal(dealId, cardId, { crmWins = true, force = false } = {}) {
  const map = await loadPresaleMap();
  const deal = await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  const prev = normalizePresale(map[dealId], deal);
  const cardIdNum = Number(cardId);
  if (!cardIdNum) throw new Error("Invalid cardId");

  const dup = Object.entries(map).find(([id, p]) => id !== dealId && String(p?.kaitenCardId) === String(cardIdNum));
  if (dup && !force) {
    throw new Error(`Card ${cardIdNum} already linked to ${dup[0]}. Use --force to reassign.`);
  }
  if (dup && force) {
    map[dup[0]] = { ...normalizePresale(map[dup[0]], null), kaitenCardId: null, kaitenCardUrl: "", updatedAt: new Date().toISOString() };
  }

  const next = {
    ...prev,
    kaitenCardId: cardIdNum,
    kaitenCardUrl: cardUrl(cardIdNum),
    kaitenSyncedAt: new Date().toISOString(),
    kaitenSyncError: "",
    kaitenSyncedCommentIds: [],
    updatedAt: new Date().toISOString(),
  };
  map[dealId] = next;
  await savePresaleMap(map);
  await addPresaleEvent(dealId, {
    type: "system",
    body: `Привязана карточка Kaiten #${cardIdNum}`,
    author: "kaiten-link",
    meta: { kaitenCardId: cardIdNum },
  }, { skipKaitenComment: true });

  if (crmWins) {
    await syncDealToKaiten(dealId, deal, next, { savedBy: "kaiten-link" });
  }
  return next;
}

(async () => {
  const dealId = process.argv[2];
  const cardId = process.argv[3];
  if (!dealId || !cardId) {
    console.error("Usage: node run-kaiten-link.js DEAL_ID CARD_ID [--no-crm-wins] [--force]");
    process.exit(1);
  }
  const crmWins = !process.argv.includes("--no-crm-wins");
  const force = process.argv.includes("--force");
  const result = await linkKaitenCardToDeal(dealId, cardId, { crmWins, force });
  console.log(JSON.stringify({ ok: true, dealId, cardId: result.kaitenCardId, url: result.kaitenCardUrl }, null, 2));
})().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});

module.exports = { linkKaitenCardToDeal };
