"use strict";
const { getAccessToken, amoGetAll } = require("/opt/itmen-pipeline/api/src/amo-client");
const { listAll, updateRecord } = require("/opt/itmen-pipeline/api/src/pb-client");
const { loadPresaleMap, savePresaleMap, normalizePresale } = require("/opt/itmen-pipeline/api/src/presale-data");

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function tokens(s) {
  return norm(s).split(/[^a-zа-яё0-9]+/i).filter(t => t.length >= 3);
}

async function auditSearchMismatch() {
  const token = await getAccessToken();
  const rows = await listAll("deals", { filter: "amo_id>0", fields: "id,deal_id,amo_id,customer" });
  const mismatches = [];
  const batch = 50;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const ids = chunk.map(r => r.amo_id).join(",");
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": ids });
    const byId = new Map(leads.map(l => [Number(l.id), l]));
    for (const row of chunk) {
      const lead = byId.get(Number(row.amo_id));
      if (!lead) continue;
      const amoTitle = String(lead.name || "").trim();
      const crmCustomer = String(row.customer || "").trim();
      if (!amoTitle || !crmCustomer) continue;
      const amoN = norm(amoTitle);
      const crmN = norm(crmCustomer);
      if (amoN === crmN || amoN.includes(crmN) || crmN.includes(amoN)) continue;
      const amoTok = tokens(amoTitle);
      const crmTok = tokens(crmCustomer);
      const shared = amoTok.filter(t => crmTok.includes(t));
      if (shared.length) continue;
      mismatches.push({
        dealId: row.deal_id,
        amoId: Number(row.amo_id),
        crmCustomer,
        amoTitle,
        url: `https://inferit.amocrm.ru/leads/detail/${row.amo_id}`,
      });
    }
  }
  mismatches.sort((a, b) => a.crmCustomer.localeCompare(b.crmCustomer, "ru"));
  return { count: mismatches.length, mismatches };
}

async function fixCustomersFromAmo(dry = true) {
  const token = await getAccessToken();
  const rows = await listAll("deals", { filter: "amo_id>0", fields: "id,deal_id,amo_id,customer" });
  let updated = 0;
  const changes = [];
  const batch = 50;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const ids = chunk.map(r => r.amo_id).join(",");
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": ids });
    const byId = new Map(leads.map(l => [Number(l.id), l]));
    for (const row of chunk) {
      const lead = byId.get(Number(row.amo_id));
      const title = String(lead?.name || "").trim();
      if (!title || title === row.customer) continue;
      const amoN = norm(title);
      const crmN = norm(row.customer || "");
      if (amoN === crmN || amoN.includes(crmN)) continue;
      changes.push({ dealId: row.deal_id, from: row.customer, to: title });
      if (!dry) {
        await updateRecord("deals", row.id, { customer: title });
        updated += 1;
      }
    }
  }
  return { dry, updated, changes };
}

async function auditKaitenCross() {
  const map = await loadPresaleMap();
  const issues = [];
  for (const [dealId, raw] of Object.entries(map)) {
    const presale = normalizePresale(raw);
    const linked = Number(presale.kaitenCardId || 0);
    if (!linked) continue;
    for (const ev of presale.events || []) {
      const cid = Number(ev?.meta?.kaitenCardId || linked);
      if (cid && cid !== linked) {
        issues.push({
          dealId,
          linked,
          eventId: ev.id,
          eventType: ev.type,
          wrongCardId: cid,
          at: ev.at,
        });
      }
    }
  }
  return { count: issues.length, issues };
}

async function fixKaitenCross(dry = true) {
  const map = await loadPresaleMap();
  let removed = 0;
  const fixed = [];
  for (const dealId of Object.keys(map)) {
    const presale = normalizePresale(map[dealId]);
    const linked = Number(presale.kaitenCardId || 0);
    if (!linked) continue;
    const before = (presale.events || []).length;
    presale.events = (presale.events || []).filter(ev => {
      const cid = Number(ev?.meta?.kaitenCardId || linked);
      return cid === linked;
    });
    const delta = before - presale.events.length;
    if (delta) {
      fixed.push({ dealId, linked, removed: delta });
      removed += delta;
      if (!dry) {
        map[dealId] = { ...presale, updatedAt: new Date().toISOString() };
      }
    }
  }
  if (!dry && removed) await savePresaleMap(map);
  return { dry, removed, fixed };
}

async function main() {
  const cmd = process.argv[2] || "search";
  if (cmd === "search") {
    console.log(JSON.stringify(await auditSearchMismatch(), null, 2));
    return;
  }
  if (cmd === "customers") {
    const dry = process.argv[3] !== "apply";
    console.log(JSON.stringify(await fixCustomersFromAmo(dry), null, 2));
    return;
  }
  if (cmd === "kaiten") {
    console.log(JSON.stringify(await auditKaitenCross(), null, 2));
    return;
  }
  if (cmd === "kaiten-fix") {
    const dry = process.argv[3] !== "apply";
    console.log(JSON.stringify(await fixKaitenCross(dry), null, 2));
    return;
  }
  console.log("Usage: audit-data.js search|customers [apply]|kaiten|kaiten-fix [apply]");
}

main().catch(e => { console.error(e); process.exit(1); });
