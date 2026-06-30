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

const { applyImportPlan } = require("../api/src/kaiten-import");

(async () => {
  const planPath = process.argv[2] || "/tmp/kaiten-import-plan.json";
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const result = await applyImportPlan(plan);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors) process.exit(result.errors > 0 ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
