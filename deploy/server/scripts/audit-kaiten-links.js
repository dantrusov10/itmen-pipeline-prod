"use strict";
const { loadPresaleMap } = require("/opt/itmen-pipeline/api/src/presale-data");
const { getCard } = require("/opt/itmen-pipeline/api/src/kaiten-client");

async function main() {
  const map = await loadPresaleMap();
  const ids = ["D-005", "D-192", "D-061"];
  const out = {};
  for (const id of ids) {
    const p = map[id] || {};
    out[id] = {
      kaitenCardId: p.kaitenCardId,
      kaitenCardUrl: p.kaitenCardUrl,
      owner: p.owner,
      stage: p.stage,
    };
    if (p.kaitenCardId) {
      try {
        const card = await getCard(p.kaitenCardId);
        out[id].cardTitle = card?.title;
        out[id].cardDescHead = String(card?.description || "").slice(0, 300);
      } catch (e) {
        out[id].cardError = e.message;
      }
    }
  }
  const cardIds = ids.map(id => String(map[id]?.kaitenCardId || "")).filter(Boolean);
  const dup = cardIds.length !== new Set(cardIds).size;
  console.log(JSON.stringify({ dup, out }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
