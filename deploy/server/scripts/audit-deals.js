"use strict";
const { findOne, listAll } = require("/opt/itmen-pipeline/api/src/pb-client");

async function main() {
  const cmd = process.argv[2] || "atommash";
  if (cmd === "atommash") {
    const byAmo = await findOne("deals", "amo_id=40704526");
    const all = await listAll("deals", { filter: 'archived=false', fields: "deal_id,customer,amo_id,stage,archived,pipeline_id" });
    const hits = all.filter(d => /атом/i.test(d.customer || "") || /atom/i.test(d.customer || "") || Number(d.amo_id) === 40704526);
    console.log(JSON.stringify({ byAmo40704526: byAmo, searchHits: hits }, null, 2));
    return;
  }
  if (cmd === "greenatom") {
    const d005 = await findOne("deals", 'deal_id="D-005"');
    const d192 = await findOne("deals", 'deal_id="D-192"');
    const acts005 = await listAll("deal_activities", { filter: `deal="${d005?.id}"`, sort: "-activity_at", fields: "id,body,author,activity_type,meta_json,ref_id" });
    const acts192 = d192 ? await listAll("deal_activities", { filter: `deal="${d192.id}"`, sort: "-activity_at", fields: "id,body,author,activity_type,meta_json,ref_id" }) : [];
    const presale = await findOne("pipeline_meta", 'slug="presale_map"');
    let map = {};
    try { map = JSON.parse(presale?.focus_goal || "{}"); } catch (_) {}
    console.log(JSON.stringify({
      d005: { id: d005?.deal_id, customer: d005?.customer, amo: d005?.amo_id, presale: map["D-005"] },
      d192: { id: d192?.deal_id, customer: d192?.customer, amo: d192?.amo_id, presale: map["D-192"] },
      d005kaitenActs: acts005.filter(a => (a.meta_json || "").includes("kaiten") || (a.body || "").includes("World Class")).slice(0, 5),
      d192kaitenActs: acts192.filter(a => (a.meta_json || "").includes("kaiten")).slice(0, 3),
    }, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
