"use strict";

const { findOne, updateRecord, listAll } = require("./pb-client");
const { loadPipelineState, saveSingleDeal } = require("./mapper");
const { addActivity } = require("./deal-crm");
const { createNotification, notifyUserByEmail } = require("./notifications");

async function archiveDeal(dealId, { savedBy, reason }) {
  const deal = await loadPipelineState({ dealId });
  if (!deal) throw new Error("Сделка не найдена");
  const pbRow = await findOne("deals", `deal_id="${dealId.replace(/"/g, '\\"')}"`);
  await updateRecord("deals", pbRow.id, {
    archived: true,
    archived_at: new Date().toISOString(),
  });
  await addActivity(dealId, {
    type: "archive",
    body: reason || "Сделка архивирована",
    author: savedBy,
  });
  return { ok: true };
}

async function unarchiveDeal(dealId, { savedBy }) {
  const pbRow = await findOne("deals", `deal_id="${dealId.replace(/"/g, '\\"')}"`);
  if (!pbRow) throw new Error("Сделка не найдена");
  await updateRecord("deals", pbRow.id, {
    archived: false,
    archived_at: null,
  });
  await addActivity(dealId, { type: "unarchive", body: "Сделка восстановлена из архива", author: savedBy });
  return { ok: true };
}

async function transferDeal(dealId, newOwner, { savedBy, user }) {
  const deal = await loadPipelineState({ dealId });
  if (!deal) throw new Error("Сделка не найдена");
  const oldOwner = deal.owner;
  deal.owner = newOwner;
  await saveSingleDeal(deal, { savedBy, isNew: false });
  await addActivity(dealId, {
    type: "owner_changed",
    body: `Владелец: ${oldOwner} → ${newOwner}`,
    author: savedBy,
    meta: { from: oldOwner, to: newOwner },
  });
  const managers = await listAll("pipeline_users");
  const target = managers.find(m => m.manager_name === newOwner);
  if (target) {
    await createNotification({
      userId: target.id,
      title: "Сделка передана вам",
      message: `${deal.customer} (${dealId})`,
      link: `#deals`,
      type: "deal_assigned",
    });
  }
  return { ok: true, deal: await loadPipelineState({ dealId }) };
}

async function bulkDeals({ action, dealIds, value }, { savedBy }) {
  const results = [];
  for (const id of dealIds || []) {
    try {
      if (action === "archive") {
        await archiveDeal(id, { savedBy, reason: value });
        results.push({ id, ok: true });
      } else if (action === "stage") {
        const deal = await loadPipelineState({ dealId: id });
        if (!deal) throw new Error("not found");
        deal.stage = value;
        await saveSingleDeal(deal, { savedBy, isNew: false });
        await addActivity(id, { type: "stage_change", body: `Стадия → ${value}`, author: savedBy });
        results.push({ id, ok: true });
      } else if (action === "owner") {
        await transferDeal(id, value, { savedBy });
        results.push({ id, ok: true });
      } else {
        results.push({ id, ok: false, error: "unknown action" });
      }
    } catch (e) {
      results.push({ id, ok: false, error: e.message });
    }
  }
  return { results };
}

module.exports = { archiveDeal, unarchiveDeal, transferDeal, bulkDeals };
