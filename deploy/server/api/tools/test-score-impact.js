#!/usr/bin/env node
"use strict";
const { listAll } = require("../src/pb-client");
const { buildScoreImpactMap } = require("../src/score-engine");

const dealId = process.argv[2] || "D-1004";
listAll("audit_log", { filter: `deal_id="${dealId}"`, sort: "at", perPage: 50 })
  .then(rows => {
    const map = buildScoreImpactMap(rows);
    rows.forEach(r => {
      console.log(r.at, r.label, "->", map[r.id] ?? "(нет)");
    });
  })
  .catch(e => { console.error(e); process.exit(1); });
