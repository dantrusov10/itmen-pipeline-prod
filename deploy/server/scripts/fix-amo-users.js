#!/usr/bin/env node
"use strict";

const path = require("path");
const API = path.join(__dirname, "..", "api", "src");

const { getAccessToken } = require(path.join(API, "amo-client"));
const { listAll, updateRecord } = require(path.join(API, "pb-client"));
const { resolveCrmPersonFromAmo, auditAmoUserMappings } = require(path.join(API, "amo-users"));

const DRY = process.argv.includes("--dry");

async function fixNumericOwners(token) {
  const deals = await listAll("deals", { fields: "id,deal_id,owner" });
  let fixed = 0;
  for (const d of deals) {
    const owner = String(d.owner || "").trim();
    if (!/^\d+$/.test(owner)) continue;
    const resolved = await resolveCrmPersonFromAmo(owner, token, { defaultIfMissing: false });
    if (!resolved || /^\d+$/.test(resolved)) {
      console.warn("unresolved owner", d.deal_id, owner);
      continue;
    }
    if (!DRY) await updateRecord("deals", d.id, { owner: resolved });
    console.log("owner", d.deal_id, owner, "->", resolved);
    fixed += 1;
  }
  return fixed;
}

async function fixNumericAssignees(token) {
  const tasks = await listAll("deal_tasks", { fields: "id,title,assignee,deal" });
  let fixed = 0;
  for (const t of tasks) {
    const assignee = String(t.assignee || "").trim();
    if (!/^\d+$/.test(assignee)) continue;
    const resolved = await resolveCrmPersonFromAmo(assignee, token, { defaultIfMissing: false });
    if (!resolved || /^\d+$/.test(resolved)) {
      console.warn("unresolved assignee", t.id, assignee, t.title);
      continue;
    }
    if (!DRY) await updateRecord("deal_tasks", t.id, { assignee: resolved });
    fixed += 1;
  }
  return fixed;
}

(async () => {
  const token = await getAccessToken();
  const audit = await auditAmoUserMappings(token);
  console.log("=== Amo → CRM mappings ===");
  for (const row of audit.mapped.sort((a, b) => Number(a.id) - Number(b.id))) {
    console.log(row.id, "->", row.crmName, row.inCrm ? "" : "(not in CRM list)");
  }
  if (audit.unmapped.length) {
    console.log("\n=== Unmapped Amo users ===");
    for (const u of audit.unmapped) console.log(u.id, u.amoName);
  }
  console.log("\n=== Fix numeric owners/assignees ===", DRY ? "(dry)" : "");
  const owners = await fixNumericOwners(token);
  const assignees = await fixNumericAssignees(token);
  console.log(JSON.stringify({ ownersFixed: owners, assigneesFixed: assignees, dry: DRY }, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
