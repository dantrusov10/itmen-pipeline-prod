"use strict";

const MSK_TZ = "Europe/Moscow";

function mskParts(d = new Date()) {
  const parts = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: MSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d).forEach(p => {
    if (p.type !== "literal") parts[p.type] = p.value;
  });
  return parts;
}

function formatMskNaive(d) {
  const p = mskParts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function formatMskNaiveFromUnix(unixSec) {
  if (!unixSec) return "";
  return formatMskNaive(new Date(Number(unixSec) * 1000));
}

function parseMskDateTime(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let iso = s;
  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) {
    const norm = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
    const withSec = norm.length === 16 ? `${norm}:00` : norm;
    iso = `${withSec}+03:00`;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeDueAtMsk(raw) {
  if (!raw) return null;
  const d = parseMskDateTime(raw);
  return d ? formatMskNaive(d) : String(raw).trim();
}

module.exports = {
  formatMskNaive,
  formatMskNaiveFromUnix,
  parseMskDateTime,
  normalizeDueAtMsk,
};
