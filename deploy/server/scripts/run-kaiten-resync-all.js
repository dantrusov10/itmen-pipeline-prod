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

const { loadPresaleMap } = require("../api/src/presale-data");
const { syncDealToKaiten } = require("../api/src/kaiten-sync");
const { loadPipelineState } = require("../api/src/mapper");
const { patchPresaleDeal } = require("../api/src/presale-data");

(async () => {
  const planPath = process.argv[2] || "/tmp/kaiten-import-plan.json";
  let forceRows = [];
  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    forceRows = (plan.rows || []).filter(r => r.forceOwner);
  }

  const map = await loadPresaleMap();
  let n = 0;

  for (const row of forceRows) {
    await patchPresaleDeal(row.dealId, { owner: row.forceOwner }, {
      savedBy: "kaiten-resync",
      syncSales: false,
    });
    n++;
  }

  for (const [dealId, p] of Object.entries(map)) {
    if (!p?.kaitenCardId) continue;
    const deal = await loadPipelineState({ dealId, includeArchived: true });
    if (!deal) continue;
    await syncDealToKaiten(dealId, deal, p, { savedBy: "kaiten-resync" });
    n++;
  }

  console.log(JSON.stringify({ ok: true, resynced: n, forced: forceRows.length }, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
