#!/usr/bin/env node
"use strict";
const { listAll } = require("../src/pb-client");
const MANAGERS = ["Аркадий Мерлейн", "Александр Сироткин", "Арслан Ахметшин", "Алексей Кулагин"];
const SINCE = process.argv[2] || "2026-06-25T16:30:00.000Z";

(async () => {
  const rows = await listAll("audit_log", { filter: `at >= "${SINCE}"`, sort: "-at", perPage: 500 });
  const filtered = rows.filter(r => MANAGERS.includes(r.saved_by));
  const byManager = {};
  const byDeal = {};
  for (const r of filtered) {
    byManager[r.saved_by] = (byManager[r.saved_by] || 0) + 1;
    if (!byDeal[r.deal_id]) byDeal[r.deal_id] = { customer: r.customer, count: 0, fields: new Set() };
    byDeal[r.deal_id].count++;
    byDeal[r.deal_id].fields.add(r.label);
  }
  console.log(`Audit since ${SINCE} by manager:`);
  Object.entries(byManager).sort((a, b) => b[1] - a[1]).forEach(([m, c]) => console.log(`  ${m}: ${c} rows`));
  console.log(`\nDeals touched: ${Object.keys(byDeal).length}`);
  Object.entries(byDeal).sort((a, b) => b[1].count - a[1].count).forEach(([id, d]) => {
    console.log(`  ${id} ${d.customer} — ${d.count} changes: ${[...d.fields].join("; ")}`);
  });
})().catch(e => { console.error(e); process.exit(1); });
