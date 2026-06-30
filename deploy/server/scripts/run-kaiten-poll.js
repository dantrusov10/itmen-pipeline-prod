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

const { pollKaitenInbound } = require("../api/src/kaiten-inbound");

(async () => {
  const result = await pollKaitenInbound();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
