"use strict";

const fs = require("fs");
const envPath = "/opt/itmen-pipeline/.env";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { matchKaitenCardsToDeals } = require("../api/src/kaiten-match");

(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const result = await matchKaitenCardsToDeals({ crmWins: true, dryRun });
  console.log(JSON.stringify(result, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
