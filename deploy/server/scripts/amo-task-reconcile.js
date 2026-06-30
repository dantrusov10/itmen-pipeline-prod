#!/usr/bin/env node
"use strict";
const path = require("path");
const { reconcileAmoTasks } = require(path.join(__dirname, "..", "api", "src", "amo-task-reconcile"));

const DRY = process.argv.includes("--dry");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : 0;
})();

reconcileAmoTasks({ dry: DRY, limit: LIMIT })
  .then(stats => {
    console.log(JSON.stringify(stats, null, 2));
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

