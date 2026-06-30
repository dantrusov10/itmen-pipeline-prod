"use strict";
const { listAll } = require("/opt/itmen-pipeline/api/src/pb-client");
const { getPresaleForDeal } = require("/opt/itmen-pipeline/api/src/presale-data");

const STAGE_MAP = {
  "Встреча состоялась": "Валидные клиенты на старте",
  "Подготовка Пилота": "Подготовка к пилоту",
  "Пилот": "В процессе пилота",
  "Пилот Окончен": "Успех пилота",
  "На паузе": "Пауза",
  "Провал пилота": "Отказ",
};

(async () => {
  const rows = await listAll("deals", { sort: "deal_id" });
  let emptyRow = 0;
  let emptyMeta = 0;
  let trusov = [];
  for (const row of rows) {
    const id = row.deal_id;
    const presale = await getPresaleForDeal(id, row);
    const owner = String(row.presale_owner || presale?.owner || "").trim();
    if (!String(row.presale_stage || "").trim()) emptyRow++;
    if (!String(presale?.stage || "").trim()) emptyMeta++;
    if (/трусов/i.test(owner)) trusov.push({ id, manager: row.stage, presale_stage: row.presale_stage || presale?.stage, owner });
  }
  console.log(JSON.stringify({ total: rows.length, emptyRow, emptyMeta, trusovCount: trusov.length, trusov: trusov.slice(0, 10) }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
