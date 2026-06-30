"use strict";

const KAITEN_STAGE_COLUMNS = {
  "Валидные клиенты на старте": 4831913,
  "Функциональный голод до пилота": 4831929,
  "Подготовка к пилоту": 4831921,
  "В процессе пилота": 4831914,
  "Ожидаем отчет по итогам": 6200254,
  "Успех пилота": 4831915,
  "Пауза": 5571657,
};

const KAITEN_LOSS_COLUMNS = {
  "Провал после демо (функциональный)": 5637984,
  "Провал пилота (функциональный)": 4831933,
  "Провал до пилота (не функциональный)": 5637957,
};

const KAITEN_COLUMN_TO_STAGE = Object.fromEntries(
  Object.entries(KAITEN_STAGE_COLUMNS).map(([k, v]) => [String(v), k]),
);

const KAITEN_COLUMN_TO_LOSS = Object.fromEntries(
  Object.entries(KAITEN_LOSS_COLUMNS).map(([k, v]) => [String(v), k]),
);

function getKaitenConfig() {
  return {
    enabled: Boolean(process.env.KAITEN_API_TOKEN),
    apiUrl: (process.env.KAITEN_API_URL || "https://inferitsoft.kaiten.ru/api/latest").replace(/\/$/, ""),
    apiToken: process.env.KAITEN_API_TOKEN || "",
    spaceId: Number(process.env.KAITEN_SPACE_ID || 612368),
    boardId: Number(process.env.KAITEN_BOARD_ID || 1391605),
    cardUrlTemplate: process.env.KAITEN_CARD_URL_TEMPLATE
      || "https://inferitsoft.kaiten.ru/space/612368/card/{id}",
    stageColumns: KAITEN_STAGE_COLUMNS,
    lossColumns: KAITEN_LOSS_COLUMNS,
    successWithoutPilotColumnId: 5637991,
    properties: {
      pilotStart: 471377,
      pilotEnd: 471378,
      distroIssueDate: 605949,
      distroEndDate: 605950,
    },
    userIdsByName: {
      "гадиров гадир": 901933,
      "гадир гадиров": 901933,
      "иван лашин": 675245,
      "трусов данила": 673958,
      "danila trusov": 673958,
    },
    userNameById: {
      901933: "Гадиров Гадир",
      675245: "Иван Лашин",
      673958: "Трусов Данила",
    },
    columnToStage: KAITEN_COLUMN_TO_STAGE,
    columnToLoss: KAITEN_COLUMN_TO_LOSS,
  };
}

function normalizePersonName(name) {
  return String(name || "").trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}

function resolveKaitenUserId(ownerName) {
  const cfg = getKaitenConfig();
  const key = normalizePersonName(ownerName);
  return cfg.userIdsByName[key] || null;
}

function resolveKaitenUserName(userId) {
  const cfg = getKaitenConfig();
  return cfg.userNameById[Number(userId)] || "";
}

function cardUrl(cardId) {
  const cfg = getKaitenConfig();
  return cfg.cardUrlTemplate.replace("{id}", String(cardId));
}

function resolveKaitenColumnId(presale) {
  const cfg = getKaitenConfig();
  if (presale?.successWithoutPilot) return cfg.successWithoutPilotColumnId;
  const stage = String(presale?.stage || "").trim();
  if (stage === "Отказ") {
    const reason = String(presale?.lossReason || "").trim();
    return cfg.lossColumns[reason] || null;
  }
  return cfg.stageColumns[stage] || null;
}

function resolvePresaleFromColumn(columnId, title = "") {
  const cfg = getKaitenConfig();
  const id = String(columnId || "");
  if (Number(id) === cfg.successWithoutPilotColumnId) {
    return { stage: "Успех пилота", successWithoutPilot: true, lossReason: "" };
  }
  const loss = cfg.columnToLoss[id];
  if (loss) return { stage: "Отказ", lossReason: loss, successWithoutPilot: false };
  const stage = cfg.columnToStage[id];
  if (stage) return { stage, lossReason: "", successWithoutPilot: false };
  return null;
}

module.exports = {
  getKaitenConfig,
  resolveKaitenUserId,
  resolveKaitenUserName,
  resolveKaitenColumnId,
  resolvePresaleFromColumn,
  cardUrl,
  normalizePersonName,
};
