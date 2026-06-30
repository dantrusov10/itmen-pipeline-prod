#!/usr/bin/env node
"use strict";
const { loadPipelineState } = require("../src/mapper");
const { calcDealScore, calcCategory } = require("../src/metrics");

const dealId = process.argv[2] || "D-1004";
loadPipelineState({ dealId }).then(d => {
  if (!d) { console.log("not found"); return; }
  const score = calcDealScore(d.scores, d.manualProb);
  console.log(JSON.stringify({
    scores: d.scores,
    manualProb: d.manualProb,
    budgetStatus: d.budgetStatus,
    stage: d.stage,
    commitStatus: d.commitStatus,
    score,
    category: calcCategory(score, d.commitStatus, d.budgetStatus),
  }, null, 2));
}).catch(e => { console.error(e); process.exit(1); });
