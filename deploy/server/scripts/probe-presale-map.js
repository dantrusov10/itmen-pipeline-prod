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
(async () => {
  const map = await loadPresaleMap();
  const linked = Object.entries(map).filter(([, p]) => p?.kaitenCardId);
  const json = JSON.stringify(map);
  console.log("deals in map", Object.keys(map).length);
  console.log("linked", linked.length);
  console.log("json bytes", json.length);
  const sample = linked.slice(0, 3).map(([id, p]) => ({ id, card: p.kaitenCardId }));
  console.log("sample", sample);
  const d002 = map["D-002"];
  console.log("D-002", d002 ? { card: d002.kaitenCardId, err: d002.kaitenSyncError } : null);
})().catch(console.error);
