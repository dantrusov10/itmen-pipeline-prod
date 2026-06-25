"use strict";

const { listAll } = require("./pb-client");
const { loadPipelineState } = require("./mapper");
const { listAllTasks } = require("./deal-crm");

async function globalSearch(q, { limit = 30 } = {}) {
  const term = String(q || "").trim().toLowerCase();
  if (term.length < 2) return { deals: [], tasks: [], activities: [], contacts: [] };

  const state = await loadPipelineState({ lite: true });
  const deals = (state?.deals || [])
    .filter(d => !d.archived)
    .filter(d =>
      [d.id, d.customer, d.owner, d.industry, d.stage].some(
        v => String(v || "").toLowerCase().includes(term),
      ),
    )
    .slice(0, limit)
    .map(d => ({ id: d.id, customer: d.customer, owner: d.owner, stage: d.stage }));

  const tasks = (await listAllTasks({}))
    .filter(t =>
      [t.title, t.assignee, t.customer, t.dealId].some(
        v => String(v || "").toLowerCase().includes(term),
      ),
    )
    .slice(0, limit);

  const dealRows = await listAll("deals", { fields: "id,deal_id,customer" });
  const dm = Object.fromEntries(dealRows.map(d => [d.id, d]));

  const activities = (await listAll("deal_activities", { sort: "-activity_at", perPage: 200 }))
    .filter(a => String(a.body || "").toLowerCase().includes(term)
      || String(a.author || "").toLowerCase().includes(term))
    .slice(0, limit)
    .map(a => ({
      id: a.id,
      dealId: dm[a.deal]?.deal_id || "",
      customer: dm[a.deal]?.customer || "",
      body: (a.body || "").slice(0, 120),
      type: a.activity_type,
    }));

  const contacts = (await listAll("deal_contacts", { perPage: 500 }))
    .filter(c => [c.name, c.email, c.phone].some(
      v => String(v || "").toLowerCase().includes(term),
    ))
    .slice(0, limit)
    .map(c => ({
      id: c.id,
      dealId: dm[c.deal]?.deal_id || "",
      customer: dm[c.deal]?.customer || "",
      name: c.name,
      email: c.email,
    }));

  return { deals, tasks, activities, contacts };
}

async function findDuplicates({ customer, excludeDealId }) {
  const name = String(customer || "").trim().toLowerCase();
  if (name.length < 2) return [];
  const state = await loadPipelineState({ lite: true });
  return (state?.deals || [])
    .filter(d => !d.archived)
    .filter(d => d.id !== excludeDealId)
    .filter(d => String(d.customer || "").trim().toLowerCase() === name
      || String(d.customer || "").toLowerCase().includes(name))
    .map(d => ({ id: d.id, customer: d.customer, owner: d.owner, stage: d.stage }));
}

module.exports = { globalSearch, findDuplicates };
