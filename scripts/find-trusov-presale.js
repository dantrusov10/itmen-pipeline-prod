"use strict";
const { listAll } = require("../src/pb-client");
const { loadPresaleMap } = require("../src/presale-data");

function inferOwner(deal) {
  const fromPresale = String(deal?.presale?.owner || "").trim();
  if (fromPresale) return fromPresale;
  const cap = String(deal?.capabilities || "").trim();
  if (!cap) return "";
  const key = cap.toLowerCase();
  const aliases = {
    "гадир гадиров": "Гадиров Гадир",
    "гадиров гадир": "Гадиров Гадир",
    "иван лашин": "Иван Лашин",
    "трусов данила": "Трусов Данила",
    "данила трусов": "Трусов Данила",
  };
  if (aliases[key]) return aliases[key];
  return cap;
}

async function main() {
  const map = await loadPresaleMap();
  const deals = await listAll("deals", { sort: "deal_id" });
  let n = 0;
  for (const row of deals) {
    const deal = { id: row.deal_id, owner: row.owner, capabilities: row.capabilities, presale: map[row.deal_id] };
    const po = inferOwner(deal);
    if (po && po.toLowerCase().includes("трусов")) {
      console.log(row.deal_id, row.customer, "mgr:", row.owner, "presale:", po, "pstage:", map[row.deal_id]?.stage || "(empty)", "sales:", row.stage);
      n++;
    }
  }
  console.log("total:", n);
}

main().catch(console.error);
