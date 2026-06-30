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

const { loadPresaleMap, savePresaleMap, normalizePresale } = require("../api/src/presale-data");
const { backfillCardToCrm } = require("../api/src/kaiten-inbound");
const { getCard } = require("../api/src/kaiten-client");

(async () => {
  const reset = process.argv.includes("--reset");
  const map = await loadPresaleMap();
  let comments = 0;
  let files = 0;
  let descriptions = 0;

  for (const [dealId, raw] of Object.entries(map)) {
    const presale = normalizePresale(raw);
    const cardId = presale.kaitenCardId;
    if (!cardId) continue;
    const card = await getCard(cardId);
    const r = await backfillCardToCrm(dealId, cardId, presale, card, { reset });
    comments += r.commentResult?.added || 0;
    files += r.fileResult?.added || 0;
    if (r.descResult?.added) descriptions++;

    map[dealId] = {
      ...normalizePresale(map[dealId]),
      kaitenSyncedCommentIds: r.commentResult?.kaitenSyncedCommentIds || [],
      kaitenSyncedFileIds: r.fileResult?.kaitenSyncedFileIds || [],
      kaitenDescriptionSynced: r.descResult?.kaitenDescriptionSynced ?? true,
      kaitenSyncedAt: new Date().toISOString(),
    };
  }

  await savePresaleMap(map);
  console.log(JSON.stringify({ ok: true, comments, files, descriptions, linked: Object.values(map).filter(p => p?.kaitenCardId).length }, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
