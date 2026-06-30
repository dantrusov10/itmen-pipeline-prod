#!/usr/bin/env node
"use strict";
const { getAmoUserIdMap } = require("../api/src/amo-users");
const { getAccessToken } = require("../api/src/amo-client");

(async () => {
  const t = await getAccessToken();
  const m = await getAmoUserIdMap(t);
  for (const id of ["13297858", "13526614", "12718890", "12862130", "12165090"]) {
    console.log(id, "->", m[id] || "(missing)");
  }
  console.log("count", Object.keys(m).length);
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
