/* Экспорт / импорт «Карта тестирования» (шаблон Excel) для требований к пилоту */
const PILOT_MAP_TEMPLATE_URL = "/assets/pilot-test-map-template.xlsx";
const PILOT_MAP_ORG_CELL = "B6";
const PILOT_MAP_HEADER_ROW = 23;
const PILOT_MAP_DATA_START = 24;
const PILOT_MAP_DATA_END = 123;
const PILOT_MAP_TYPES = ["Тех", "ИБ", "Бизнес", "Интеграции", "Отчеты"];

function ensureExcelJS() {
  if (!window.ExcelJS) throw new Error("Библиотека ExcelJS не загружена");
  return window.ExcelJS;
}

function cellText(cell) {
  if (!cell || cell.value == null) return "";
  const v = cell.value;
  if (typeof v === "object" && v.richText) {
    return v.richText.map(t => t.text || "").join("").trim();
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function sanitizeFileNamePart(s) {
  return String(s || "сделка").replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "сделка";
}

function parseMandatory(val) {
  const v = String(val || "").trim().toLowerCase();
  if (v === "нет" || v === "no" || v === "0" || v === "false") return false;
  return true;
}

function normalizeReqType(val) {
  const v = String(val || "").trim();
  if (PILOT_MAP_TYPES.includes(v)) return v;
  const low = v.toLowerCase();
  const hit = PILOT_MAP_TYPES.find(t => t.toLowerCase() === low);
  return hit || "Тех";
}

async function loadPilotMapTemplateWorkbook() {
  const ExcelJS = ensureExcelJS();
  const res = await fetch(PILOT_MAP_TEMPLATE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось загрузить шаблон карты тестирования");
  const buf = await res.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

function clearPilotMapDataRows(ws) {
  for (let r = PILOT_MAP_DATA_START; r <= PILOT_MAP_DATA_END; r++) {
    for (const col of [1, 2, 3, 4, 5]) {
      const cell = ws.getCell(r, col);
      cell.value = null;
    }
  }
}

function writePilotRowsToSheet(ws, rows) {
  clearPilotMapDataRows(ws);
  let rowNum = PILOT_MAP_DATA_START;
  for (const r of rows || []) {
    const biz = String(r.businessNeed || "").trim();
    const req = String(r.clientRequirement || "").trim();
    if (!biz && !req) continue;
    ws.getCell(rowNum, 1).value = biz;
    ws.getCell(rowNum, 2).value = req;
    ws.getCell(rowNum, 3).value = normalizeReqType(r.reqType);
    ws.getCell(rowNum, 4).value = r.isMandatory === false ? "Нет" : "Да";
    ws.getCell(rowNum, 5).value = String(r.verificationMetric || "").trim();
    rowNum += 1;
    if (rowNum > PILOT_MAP_DATA_END) break;
  }
}

async function exportPilotMapTemplate(dealId, rows, customerName) {
  const wb = await loadPilotMapTemplateWorkbook();
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Лист шаблона не найден");
  ws.getCell(PILOT_MAP_ORG_CELL).value = String(customerName || "").trim() || dealId || "";
  writePilotRowsToSheet(ws, rows);
  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const name = `Карта тестирования — ${sanitizeFileNamePart(customerName || dealId)}.xlsx`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return name;
}

function findPilotMapHeaderRow(ws) {
  for (let r = 20; r <= 35; r++) {
    const a = cellText(ws.getCell(r, 1)).toLowerCase();
    const b = cellText(ws.getCell(r, 2)).toLowerCase();
    if (a.includes("бизнес") && b.includes("требован")) return r;
  }
  return PILOT_MAP_HEADER_ROW;
}

async function parsePilotMapXlsx(file) {
  const ExcelJS = ensureExcelJS();
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Файл не содержит листов");
  const headerRow = findPilotMapHeaderRow(ws);
  const dataStart = headerRow + 1;
  const org = cellText(ws.getCell(PILOT_MAP_ORG_CELL));
  const rows = [];
  for (let r = dataStart; r <= ws.rowCount + 5; r++) {
    const biz = cellText(ws.getCell(r, 1));
    const req = cellText(ws.getCell(r, 2));
    const typ = cellText(ws.getCell(r, 3));
    const must = cellText(ws.getCell(r, 4));
    const metric = cellText(ws.getCell(r, 5));
    if (!biz && !req) {
      if (rows.length && !cellText(ws.getCell(r + 1, 1)) && !cellText(ws.getCell(r + 1, 2))) break;
      if (!rows.length) continue;
      if (!biz && !req && !typ && !must && !metric) break;
      continue;
    }
    rows.push({
      businessNeed: biz,
      clientRequirement: req,
      reqType: normalizeReqType(typ),
      isMandatory: parseMandatory(must),
      feasibility: "—",
      verificationMetric: metric,
      _imported: true,
    });
  }
  if (!rows.length) throw new Error("В файле не найден блок «Требования к пилоту» (таблица пуста)");
  return { organization: org, rows };
}

window.exportPilotMapTemplate = exportPilotMapTemplate;
window.parsePilotMapXlsx = parsePilotMapXlsx;
