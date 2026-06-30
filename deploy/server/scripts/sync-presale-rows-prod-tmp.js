"use strict";
const {
  listAll,
} = require("/opt/itmen-pipeline/api/src/pb-client");
const {
  loadPresaleMap,
  savePresaleMap,
  normalizePresale,
  inferPresaleOwnerFromDeal,
  resolvePresaleStageFromSalesStage,
  syncPresaleFieldsToDealRow,
} = require("/opt/itmen-pipeline/api/src/presale-data");

(async () => {
  const rows = await listAll("deals", { sort: "deal_id" });
  const map = await loadPresaleMap();
  let metaTouched = 0;
  let rowSynced = 0;

  for (const row of rows) {
    const dealId = row.deal_id;
    if (!dealId) continue;
    const deal = {
      id: dealId,
      stage: row.stage || "",
      capabilities: row.capabilities || "",
      lossReason: row.loss_reason || "",
      presale_stage: row.presale_stage || "",
      presale_owner: row.presale_owner || "",
    };
    const prev = normalizePresale(map[dealId], deal);
    let next = { ...prev };
    let touched = false;

    const owner = inferPresaleOwnerFromDeal({ presale: prev, capabilities: deal.capabilities, presale_owner: row.presale_owner });
    if (owner && owner !== next.owner) {
      next.owner = owner;
      touched = true;
    }

    if (!next.stage) {
      const fromRow = String(row.presale_stage || "").trim();
      if (fromRow) {
        next.stage = fromRow;
        touched = true;
      } else {
        const resolved = resolvePresaleStageFromSalesStage(deal.stage);
        if (resolved?.stage) {
          next.stage = resolved.stage;
          if (resolved.salesRejectMode) next.salesRejectMode = resolved.salesRejectMode;
          if (resolved.successWithoutPilot) next.successWithoutPilot = true;
          touched = true;
        }
      }
    }

    if (touched) {
      next.updatedAt = new Date().toISOString();
      map[dealId] = next;
      metaTouched++;
    }

    const rowStage = String(row.presale_stage || "").trim();
    const rowOwner = String(row.presale_owner || "").trim();
    if ((next.stage && rowStage !== next.stage) || (next.owner && rowOwner !== next.owner)) {
      await syncPresaleFieldsToDealRow(dealId, { stage: next.stage, owner: next.owner });
      rowSynced++;
    }
  }

  if (metaTouched) await savePresaleMap(map);
  console.log(JSON.stringify({ metaTouched, rowSynced, total: rows.length }));
})().catch(e => { console.error(e); process.exit(1); });
