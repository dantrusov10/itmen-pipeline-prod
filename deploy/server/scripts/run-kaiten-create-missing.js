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
const { listAll } = require("../api/src/pb-client");
const { loadPipelineState } = require("../api/src/mapper");
const { loadPresaleMap, normalizePresale } = require("../api/src/presale-data");
const { dealInPresaleFunnel } = require("../api/src/kaiten-sync");
const { createKaitenCardForDeal } = require("../api/src/kaiten-import");

(async () => {
  const [rows, map] = await Promise.all([
    listAll("deals", { sort: "deal_id" }),
    loadPresaleMap(),
  ]);
  const missing = [];
  for (const row of rows) {
    const dealId = row.deal_id;
    if (!dealId) continue;
    const deal = await loadPipelineState({ dealId, includeArchived: true });
    if (!deal || deal.archived) continue;
    const presale = normalizePresale(map[dealId], deal);
    if (!dealInPresaleFunnel(deal, presale)) continue;
    if (presale.kaitenCardId) continue;
    missing.push(dealId);
  }
  let created = 0;
  for (const dealId of missing) {
    try {
      await createKaitenCardForDeal(dealId);
      created++;
    } catch (e) {
      console.warn(dealId, e.message);
    }
  }
  console.log(JSON.stringify({ missing: missing.length, created }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
