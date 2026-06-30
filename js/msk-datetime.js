/* Даты/время CRM — всегда Europe/Moscow (МСК) */
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

function mskTodayKey() {
  const p = mskParts();
  return `${p.year}-${p.month}-${p.day}`;
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

function mskDateKey(raw) {
  const d = parseMskDateTime(raw);
  if (!d) return String(raw || "").slice(0, 10);
  const p = mskParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function mskHour(raw) {
  const d = parseMskDateTime(raw);
  if (!d) return 9;
  const h = parseInt(mskParts(d).hour, 10);
  return Math.max(8, Math.min(20, Number.isNaN(h) ? 9 : h));
}

function mskTimeLabel(raw) {
  const d = parseMskDateTime(raw);
  if (!d) return "09:00";
  return d.toLocaleTimeString("ru-RU", { timeZone: MSK_TZ, hour: "2-digit", minute: "2-digit" });
}

function formatMskDateTimeLabel(raw) {
  const d = parseMskDateTime(raw);
  if (!d) return String(raw || "").slice(0, 16).replace("T", " ") || "—";
  return d.toLocaleString("ru-RU", {
    timeZone: MSK_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isTaskOverdueMsk(raw, status) {
  if (status === "done") return false;
  const due = parseMskDateTime(raw);
  if (!due) return false;
  return Date.now() > due.getTime();
}

function toDatetimeLocalMsk(raw) {
  const d = parseMskDateTime(raw);
  if (!d) {
    const s = String(raw || "").slice(0, 16);
    return s.includes(" ") ? s.replace(" ", "T") : s;
  }
  const p = mskParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function fromDatetimeLocalMsk(localVal) {
  const v = String(localVal || "").trim().replace(" ", "T");
  if (!v) return "";
  const base = v.length === 16 ? `${v}:00` : v.slice(0, 19);
  const d = new Date(`${base}+03:00`);
  if (Number.isNaN(d.getTime())) return v.replace("T", " ");
  return formatMskNaive(d);
}

function addMskDays(days, hour = 18) {
  const p = mskParts();
  const d = new Date(`${p.year}-${p.month}-${p.day}T${String(hour).padStart(2, "0")}:00:00+03:00`);
  d.setTime(d.getTime() + days * 86400000);
  return formatMskNaive(d);
}

function formatRuDate(raw) {
  if (!raw) return "—";
  const s = String(raw).trim();
  const isoKey = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoKey) return `${isoKey[3]}.${isoKey[2]}.${isoKey[1]}`;
  const d = parseMskDateTime(raw);
  if (!d) return s || "—";
  const p = mskParts(d);
  return `${p.day}.${p.month}.${p.year}`;
}

function formatRuDateTime(raw) {
  if (!raw) return "—";
  if (typeof formatMskDateTimeLabel === "function") {
    const labeled = formatMskDateTimeLabel(raw);
    if (labeled && labeled !== "—") return labeled;
  }
  const d = parseMskDateTime(raw);
  if (!d) return String(raw).replace("T", " ").slice(0, 16);
  const p = mskParts(d);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

function isoDateKeyToRu(isoKey) {
  const m = String(isoKey || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(isoKey || "");
}

function ruDateToIsoKey(ru) {
  const m = String(ru || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return String(ru || "").trim();
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function mskTodayRu() {
  const p = mskParts();
  return `${p.day}.${p.month}.${p.year}`;
}

/** Открыть нативный выбор даты/времени (Chrome/Edge); иначе focus */
function openDatetimePicker(input) {
  if (!input) return;
  try {
    if (typeof input.showPicker === "function") input.showPicker();
    else input.focus();
  } catch (_) {
    input.focus();
  }
}

/** Подключить клик → showPicker для datetime-local */
function wireDatetimeInput(input) {
  if (!input || input.dataset.pickerWired === "1") return;
  input.dataset.pickerWired = "1";
  input.addEventListener("click", e => {
    e.stopPropagation();
    openDatetimePicker(input);
  });
}

window.openDatetimePicker = openDatetimePicker;
window.wireDatetimeInput = wireDatetimeInput;
window.parseMskDateTime = parseMskDateTime;
window.formatMskNaive = formatMskNaive;
window.mskDateKey = mskDateKey;
window.mskHour = mskHour;
window.mskTimeLabel = mskTimeLabel;
window.formatMskDateTimeLabel = formatMskDateTimeLabel;
window.isTaskOverdueMsk = isTaskOverdueMsk;
window.toDatetimeLocalMsk = toDatetimeLocalMsk;
window.fromDatetimeLocalMsk = fromDatetimeLocalMsk;
window.addMskDays = addMskDays;
window.mskTodayKey = mskTodayKey;
window.formatRuDate = formatRuDate;
window.formatRuDateTime = formatRuDateTime;
window.isoDateKeyToRu = isoDateKeyToRu;
window.ruDateToIsoKey = ruDateToIsoKey;
window.mskTodayRu = mskTodayRu;
