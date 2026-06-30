"use strict";

const { listAll, updateRecord } = require("./pb-client");
const { mskParts } = require("./msk-datetime");
const { sendEmailNotification } = require("./mailer");

const PUBLIC_BASE = (process.env.PUBLIC_URL || "https://itmen-pipeline.nwlvl.ru").replace(/\/$/, "");

function mskMinuteKey(d = new Date()) {
  const p = mskParts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function dueAtMinuteKey(dueAt) {
  const s = String(dueAt || "").trim();
  if (!s) return "";
  const norm = s.includes("T") ? s.replace("T", " ") : s;
  return norm.slice(0, 16);
}

function formatDueDisplay(dueAt) {
  const key = dueAtMinuteKey(dueAt);
  if (!key) return "";
  const [date, time] = key.split(" ");
  return `${date} ${time} (МСК)`;
}

async function loadUserEmailMap() {
  const users = await listAll("pipeline_users");
  const profiles = await listAll("user_profiles");
  const profByUser = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  const byManager = new Map();
  for (const u of users) {
    const prof = profByUser[u.id];
    const notifyOk = prof?.notify_email !== false && prof?.notify_task_due !== false;
    const email = String(prof?.email || u.email || "").trim();
    const manager = String(u.manager_name || u.display_name || "").trim();
    if (!manager || !email || !notifyOk) continue;
    const key = manager.normalize("NFC").toLowerCase();
    byManager.set(key, { email, userId: u.id, manager });
  }
  return byManager;
}

async function resolveAssigneeEmail(assignee, byManager) {
  const key = String(assignee || "").trim().normalize("NFC").toLowerCase();
  if (!key) return null;
  return byManager.get(key) || null;
}

async function sendDueReminders({ now = new Date() } = {}) {
  if (!process.env.SMTP_HOST && !process.env.SMTP_USER) {
    return { skipped: true, reason: "SMTP not configured" };
  }

  const minute = mskMinuteKey(now);
  const prefix = minute;
  const rows = await listAll("deal_tasks", {
    filter: `status="open" && due_at >= "${prefix}:00" && due_at <= "${prefix}:59"`,
    sort: "due_at",
  });
  const pending = rows.filter(r => r.due_at && !r.due_email_sent_at && dueAtMinuteKey(r.due_at) === minute);
  if (!pending.length) return { minute, sent: 0, skipped: 0 };

  const dealRows = await listAll("deals", { fields: "id,deal_id,customer" });
  const dealMap = Object.fromEntries(dealRows.map(d => [d.id, d]));
  const byManager = await loadUserEmailMap();

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const task of pending) {
    const deal = dealMap[task.deal];
    const dealId = deal?.deal_id || "";
    const hit = await resolveAssigneeEmail(task.assignee, byManager);
    if (!hit) {
      skipped++;
      continue;
    }
    const link = dealId ? `${PUBLIC_BASE}/#deal/${encodeURIComponent(dealId)}` : PUBLIC_BASE;
    const customer = deal?.customer ? ` · ${deal.customer}` : "";
    const desc = String(task.description || "").trim();
    const lines = [
      `Задача: ${task.title || "—"}`,
      `Срок: ${formatDueDisplay(task.due_at)}`,
      dealId ? `Сделка: ${dealId}${customer}` : "",
      desc ? `\nОписание:\n${desc}` : "",
      `\nОткрыть в CRM:\n${link}`,
    ].filter(Boolean);

    try {
      const ok = await sendEmailNotification(hit.email, {
        title: `Напоминание: ${task.title || "задача"}`,
        message: lines.join("\n"),
        link,
      });
      if (ok) {
        await updateRecord("deal_tasks", task.id, {
          due_email_sent_at: new Date().toISOString(),
        });
        sent++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push({ taskId: task.id, error: e.message });
    }
  }

  return { minute, sent, skipped, errors, total: pending.length };
}

module.exports = { sendDueReminders, mskMinuteKey };
