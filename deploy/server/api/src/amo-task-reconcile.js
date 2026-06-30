"use strict";

const { getAccessToken, amoGetAll } = require("./amo-client");
const { getPipelinesConfig } = require("./pipelines-config");
const { listAll } = require("./pb-client");
const { syncLeadNotesAndTasks } = require("./amo-lead-sync");

const TARGET_PIPELINES = new Set(["sales", "partners", "tech_partners"]);

async function reconcileAmoTasks({ dry = false, limit = 0 } = {}) {
  const token = await getAccessToken();
  const cfg = await getPipelinesConfig();
  const pipeIds = new Set((cfg.pipelines || []).filter(p => TARGET_PIPELINES.has(p.id)).map(p => p.id));

  const deals = await listAll("deals", {
    filter: "archived=false && amo_id>0",
    fields: "id,deal_id,amo_id,pipeline_id,deal_type,customer,owner",
    sort: "deal_id",
  });

  const target = deals.filter(d => {
    const pid = d.pipeline_id || "";
    if (pipeIds.has(pid)) return true;
    if (pid) return false;
    const dt = String(d.deal_type || "");
    if (dt.startsWith("ref:partners")) return true;
    if (dt.startsWith("ref:tech_partners")) return true;
    return !dt.startsWith("ref:") && !dt.includes("пре-сейл");
  });

  const rows = limit > 0 ? target.slice(0, limit) : target;
  const stats = {
    deals: 0,
    dealsTotal: rows.length,
    synced: 0,
    skipped: 0,
    errors: [],
    dry,
  };

  for (const dealRow of rows) {
    try {
      if (dry) {
        stats.deals += 1;
        continue;
      }
      const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": dealRow.amo_id });
      const lead = leads[0];
      if (!lead) {
        stats.skipped += 1;
        continue;
      }
      await syncLeadNotesAndTasks({
        lead,
        token,
        dealId: dealRow.deal_id,
        pbId: dealRow.id,
      });
      stats.synced += 1;
      stats.deals += 1;
    } catch (e) {
      stats.errors.push({ dealId: dealRow.deal_id, error: e.message });
    }
  }

  return stats;
}

module.exports = { reconcileAmoTasks };
