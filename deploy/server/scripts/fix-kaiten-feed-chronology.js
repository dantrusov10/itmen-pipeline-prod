#!/usr/bin/env node
"use strict";
/** Исправить даты событий Kaiten в пре-сейл ленте. */
const { fixKaitenFeedChronology } = require("/opt/itmen-pipeline/api/src/kaiten-inbound");

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const batchSize = Number(process.argv[2] || 30);
  let offset = Number(process.argv[3] || 0);
  const maxRounds = Number(process.argv[4] || 15);
  let rounds = 0;
  let totalFixed = 0;

  while (rounds < maxRounds) {
    const r = await fixKaitenFeedChronology({ batchSize, offset });
    rounds += 1;
    totalFixed += r.fixed || 0;
    offset = r.nextOffset || 0;
    console.log(JSON.stringify({ round: rounds, ...r }));
    if (!r.total || (offset === 0 && rounds > 1)) break;
    await sleep(500);
  }
  console.log("done", { rounds, totalFixed });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
