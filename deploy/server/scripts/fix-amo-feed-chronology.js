#!/usr/bin/env node
"use strict";
/** Переразложить ленту Amo по хронологии для всех сделок. */
const { fixAmoFeedChronology } = require("/opt/itmen-pipeline/api/src/amo-lead-sync");

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const batchSize = Number(process.argv[2] || 40);
  let offset = Number(process.argv[3] || 0);
  const maxRounds = Number(process.argv[4] || 20);
  let rounds = 0;
  let totalSynced = 0;
  let totalErrors = 0;
  let total = 0;

  while (rounds < maxRounds) {
    const r = await fixAmoFeedChronology({ batchSize, offset });
    rounds += 1;
    total = r.total || total;
    totalSynced += r.synced || 0;
    totalErrors += r.errors || 0;
    offset = r.nextOffset || 0;
    console.log(JSON.stringify({ round: rounds, ...r }));
    const fullPass = offset === 0 && rounds > 1;
    if (fullPass && r.errors === 0) break;
    if (fullPass && rounds >= Math.ceil((total || 1) / batchSize) + 3) break;
    await sleep(r.errors > 0 ? 3000 : 800);
  }
  console.log("done", { rounds, total, totalSynced, totalErrors });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
