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
const { syncCommentsFromCard } = require("../api/src/kaiten-inbound");

(async () => {
  const reset = process.argv.includes("--reset-ids");
  const map = await loadPresaleMap();
  let total = 0;
  const details = [];

  for (const [dealId, raw] of Object.entries(map)) {
    const presale = normalizePresale(raw);
    const cardId = presale.kaitenCardId;
    if (!cardId) continue;

    if (reset) {
      presale.kaitenSyncedCommentIds = [];
      map[dealId] = presale;
    }

    const result = await syncCommentsFromCard(dealId, cardId, presale);
    map[dealId] = {
      ...normalizePresale(map[dealId]),
      kaitenSyncedCommentIds: result.kaitenSyncedCommentIds || [],
      kaitenSyncedAt: new Date().toISOString(),
      kaitenSyncError: result.error || "",
    };
    if (result.added) {
      total += result.added;
      details.push({ dealId, cardId, added: result.added });
    }
  }

  await savePresaleMap(map);
  console.log(JSON.stringify({ ok: true, comments: total, deals: details.length, details }, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
