#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

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
const { listBoardCards } = require("../api/src/kaiten-client");
const { cardUrl } = require("../api/src/kaiten-config");

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map(h => csvEscape(row[h])).join(","));
  return lines.join("\n");
}

(async () => {
  const outDir = process.argv[2] || "/tmp";
  const [dealRows, cardsRaw, presaleMap] = await Promise.all([
    listAll("deals", { sort: "deal_id" }),
    listBoardCards(500),
    loadPresaleMap(),
  ]);
  const cards = Array.isArray(cardsRaw) ? cardsRaw : (cardsRaw?.cards || cardsRaw?.items || []);

  const crmRows = [];
  for (const row of dealRows) {
    const dealId = row.deal_id;
    if (!dealId) continue;
    const deal = await loadPipelineState({ dealId, includeArchived: true });
    if (!deal || deal.archived) continue;
    if (!dealInPresaleFunnel(deal, normalizePresale(presaleMap[dealId], deal))) continue;
    const presale = normalizePresale(presaleMap[dealId], deal);
    crmRows.push({
      deal_id: dealId,
      customer: deal.customer || "",
      presale_stage: presale.stage || deal.presale_stage || "",
      presale_owner: presale.owner || deal.presale_owner || "",
      kaiten_card_id: presale.kaitenCardId || "",
      kaiten_url: presale.kaitenCardUrl || "",
    });
  }

  const kaitenRows = cards.map(c => ({
    card_id: c.id,
    title: c.title || "",
    column: c.column?.title || c.column_id || "",
    url: cardUrl(c.id),
  }));

  const crmPath = path.join(outDir, "kaiten-match-crm.csv");
  const kaitenPath = path.join(outDir, "kaiten-match-kaiten.csv");
  fs.writeFileSync(crmPath, `\ufeff${toCsv(crmRows, ["deal_id", "customer", "presale_stage", "presale_owner", "kaiten_card_id", "kaiten_url"])}`, "utf8");
  fs.writeFileSync(kaitenPath, `\ufeff${toCsv(kaitenRows, ["card_id", "title", "column", "url"])}`, "utf8");

  const linked = crmRows.filter(r => r.kaiten_card_id);
  console.log(JSON.stringify({
    ok: true,
    crmCount: crmRows.length,
    kaitenCount: kaitenRows.length,
    linkedCount: linked.length,
    linked,
    crmPath,
    kaitenPath,
  }, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
