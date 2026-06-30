"use strict";
const { listAll } = require("../src/pb-client");

async function main() {
  const users = await listAll("pipeline_users");
  users.forEach(u => console.log(u.email, u.role, u.manager_name, u.display_name));
  const deals = await listAll("deals", { sort: "deal_id" });
  const q = "трусов";
  deals.filter(d => {
    const cap = String(d.capabilities || "").toLowerCase();
    return cap.includes(q);
  }).slice(0, 10).forEach(d => console.log(d.deal_id, d.customer, d.owner, d.capabilities?.slice(0, 60)));
}

main().catch(console.error);
