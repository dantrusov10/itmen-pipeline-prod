"use strict";
const { backfillPresaleFromDeals } = require("../api/src/presale-data");

backfillPresaleFromDeals()
  .then(r => {
    console.log(JSON.stringify(r));
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
