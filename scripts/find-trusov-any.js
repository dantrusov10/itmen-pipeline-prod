"use strict";
const { listAll } = require("../src/pb-client");
async function main() {
  const deals = await listAll("deals");
  const hits = deals.filter(d => String(d.capabilities || d.owner || "").toLowerCase().includes("трусов"));
  hits.forEach(d => console.log(d.deal_id, d.customer, "owner:", d.owner, "cap:", (d.capabilities || "").slice(0, 80)));
  console.log("hits:", hits.length);
}
main().catch(console.error);
