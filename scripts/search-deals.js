"use strict";
const { listAll } = require("../src/pb-client");
const q = process.argv[2] || "192";
listAll("deals", { sort: "deal_id" })
  .then(rows => rows.filter(r => String(r.deal_id || "").toLowerCase().includes(String(q).toLowerCase())))
  .then(rows => {
    rows.forEach(r => console.log(r.deal_id, r.customer, r.stage));
    if (!rows.length) console.log("No matches for", q);
  })
  .catch(e => { console.error(e); process.exit(1); });
