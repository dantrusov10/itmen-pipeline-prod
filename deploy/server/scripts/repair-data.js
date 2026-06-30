"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { findOne, updateRecord } = require("/opt/itmen-pipeline/api/src/pb-client");
const { loadPresaleMap, savePresaleMap, normalizePresale } = require("/opt/itmen-pipeline/api/src/presale-data");

async function fixCustomer(dealId, amoId) {
  const token = await getAccessToken();
  const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": amoId });
  const title = String(leads[0]?.name || "").trim();
  const row = await findOne("deals", `deal_id="${dealId.replace(/"/g, '\\"')}"`);
  if (!row || !title) throw new Error("missing row or title");
  await updateRecord("deals", row.id, { customer: title });
  return { dealId, customer: title };
}

async function fixPresaleCross(dealId) {
  const map = await loadPresaleMap();
  const presale = normalizePresale(map[dealId]);
  const linked = Number(presale.kaitenCardId || 0);
  if (!linked) return { dealId, removed: 0 };
  const before = (presale.events || []).length;
  presale.events = (presale.events || []).filter(ev => {
    const cid = Number(ev?.meta?.kaitenCardId || linked);
    return cid === linked;
  });
  const removed = before - presale.events.length;
  map[dealId] = { ...presale, updatedAt: new Date().toISOString() };
  await savePresaleMap(map);
  return { dealId, linked, removed, left: presale.events.length };
}

async function main() {
  const cmd = process.argv[2] || "all";
  if (cmd === "d061") {
    console.log(JSON.stringify(await fixCustomer("D-061", 40704526), null, 2));
    return;
  }
  if (cmd === "d005") {
    console.log(JSON.stringify(await fixPresaleCross("D-005"), null, 2));
    return;
  }
  console.log(JSON.stringify({
    d061: await fixCustomer("D-061", 40704526),
    d005: await fixPresaleCross("D-005"),
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
