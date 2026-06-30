"use strict";

const { normalizeDueAtMsk } = require("./msk-datetime");

function normTitle(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/ё/g, "е");
}

function dueTimestamp(raw) {
  const n = normalizeDueAtMsk(raw);
  if (!n) return 0;
  const iso = n.includes("T") ? n : `${n.replace(" ", "T")}+03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function isAmoTaskRef(ref) {
  return String(ref || "").trim().startsWith("amo:task:");
}

const PRESALE_STAFF = ["Гадиров Гадир", "Иван Лашин", "Трусов Данила"];

function normPersonName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/ё/g, "е");
}

function isPresaleStaff(name) {
  const n = normPersonName(name);
  return PRESALE_STAFF.some(s => normPersonName(s) === n);
}

function isSalesAmoTaskRow(task) {
  if (!task) return false;
  if (isAmoTaskRef(task.activity_id)) return true;
  const who = String(task.assignee || task.created_by || "").trim();
  if (who === "amo-sync" || who === "amo") return true;
  if (/^\d+$/.test(who)) return true;
  return !isPresaleStaff(who);
}

function isSalesPipelineDeal(deal) {
  if (!deal) return false;
  const pid = String(deal.pipeline_id || "").trim();
  if (pid === "presale") return false;
  const dt = String(deal.deal_type || "");
  if (/пре-?сейл/i.test(dt)) return false;
  if (pid === "sales" || pid === "partners" || pid === "tech_partners") return true;
  if (dt.startsWith("ref:partners") || dt.startsWith("ref:tech_partners")) return true;
  return !dt.startsWith("ref:") && !pid;
}

function taskAmoScore(task, preferredAmoRef = "") {
  const ref = String(task?.activity_id || "").trim();
  let score = 0;
  if (ref && ref === preferredAmoRef) score += 1000;
  else if (isAmoTaskRef(ref)) score += 100;
  score += dueTimestamp(task?.due_at) / 1e12;
  return score;
}

function pickCanonicalOpenTask(tasks, preferredAmoRef = "") {
  const open = (tasks || []).filter(t => (t.status || "open") !== "done");
  if (!open.length) return null;
  return [...open].sort((a, b) => taskAmoScore(b, preferredAmoRef) - taskAmoScore(a, preferredAmoRef))[0];
}

function groupTasksByTitle(tasks) {
  const map = new Map();
  for (const t of tasks || []) {
    const key = normTitle(t.title);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return map;
}

module.exports = {
  normTitle,
  dueTimestamp,
  isAmoTaskRef,
  taskAmoScore,
  pickCanonicalOpenTask,
  groupTasksByTitle,
  isPresaleStaff,
  isSalesAmoTaskRow,
  isSalesPipelineDeal,
};
