/* Пространства CRM: Продажи (основное) + Пре-сейл (дочернее) */

window.ITMEN_WORKSPACES = {
  sales: {
    id: "sales",
    label: "Продажи",
    parentId: null,
    childIds: ["presale"],
    isDefault: true,
    kind: "sales",
  },
  presale: {
    id: "presale",
    label: "Пре-сейл",
    parentId: "sales",
    childIds: [],
    linkedToParent: true,
    kind: "presale",
  },
  partners: {
    id: "partners",
    label: "Партнёры",
    parentId: null,
    childIds: [],
    kind: "reference",
    dealType: "ref:partners",
    stagesListKey: "partner_stages",
    kanbanConfigKey: "partner_kanban_stages",
  },
  tech_partners: {
    id: "tech_partners",
    label: "Технологические партнёры",
    parentId: null,
    childIds: [],
    kind: "reference",
    dealType: "ref:tech_partners",
    stagesListKey: "tech_partner_stages",
    kanbanConfigKey: "tech_partner_kanban_stages",
  },
};

/** Канонический список стадий воронки менеджера (не Kaiten / не PB) */
window.ITMEN_SALES_STAGES = [
  "Входящие лиды",
  "Взят в работу",
  "Встреча состоялась",
  "Интерес  Выявлен",
  "Подготовка Пилота",
  "Пилот",
  "Ожидаем отчет по итогам",
  "Пилот Окончен",
  "Провал пилота",
  "Предложение выслано",
  "Согласование бюджета",
  "Финальный компред",
  "Условия согласованы",
  "Документы подписаны",
  "Отгружен",
  "Успешно реализовано",
  "На паузе",
  "Отказ",
];

/** Стадии продаж, которые менеджер не может выставить сам — только через пре-сейл */
window.ITMEN_PRESALE_ONLY_SALES_STAGES = ["Пилот Окончен"];

function isManagerLockedSalesStage(stage) {
  const locked = window.ITMEN_PRESALE_ONLY_SALES_STAGES || ["Пилот Окончен"];
  return locked.includes(String(stage || "").trim());
}

function managerSelectableStageOptions(currentStage) {
  const locked = new Set(window.ITMEN_PRESALE_ONLY_SALES_STAGES || ["Пилот Окончен"]);
  const cur = String(currentStage || "").trim();
  return salesStageOptions(cur).filter(s => !locked.has(s) || s === cur);
}

function managerStageChangeBlocked(newStage, prevStage) {
  if (typeof isAdmin === "function" && isAdmin()) return false;
  if (typeof isPresaleUser === "function" && isPresaleUser()) return false;
  const cur = String(prevStage || "").trim();
  const next = String(newStage || "").trim();
  if (next === cur) return false;
  return isManagerLockedSalesStage(next);
}

/** Порядок колонок канбана пре-сейла */
window.ITMEN_PRESALE_FUNNEL_STAGES = [
  "Валидные клиенты на старте",
  "Функциональный голод до пилота",
  "Подготовка к пилоту",
  "В процессе пилота",
  "Ожидаем отчет по итогам",
  "Успех пилота",
  "Пауза",
  "Отказ",
];

window.ITMEN_PRESALE_LOSS_REASONS = [
  "Провал после демо (функциональный)",
  "Провал до пилота (не функциональный)",
  "Провал пилота (функциональный)",
];

/** Старые этапы-провалы → единый «Отказ» + причина */
window.ITMEN_PRESALE_LEGACY_LOSS_STAGES = {
  "Провал после демо (функциональный)": "Провал после демо (функциональный)",
  "Провал до пилота (не функциональный)": "Провал до пилота (не функциональный)",
  "Провал пилота (функциональный)": "Провал пилота (функциональный)",
  "Успех без пилота": null,
};

window.ITMEN_PRESALE_STAGES = [...window.ITMEN_PRESALE_FUNNEL_STAGES];

window.ITMEN_PRESALE_STAGE_OTKAZ = "Отказ";
window.ITMEN_PRESALE_STAGE_SUCCESS = "Успех пилота";
window.ITMEN_SALES_STAGE_SUCCESS_WITHOUT_PILOT = "Финальный компред";

window.ITMEN_AMO_PRESALE_OWNER_ALIASES = {
  "гадир гадиров": "Гадиров Гадир",
  "гадиров гадир": "Гадиров Гадир",
  "иван лашин": "Иван Лашин",
  "лашин иван": "Иван Лашин",
  "трусов данила": "Трусов Данила",
  "данила трусов": "Трусов Данила",
  "мерлейн аркадий": "Аркадий Мерлейн",
  "аркадий мерлейн": "Аркадий Мерлейн",
  "сироткин александр": "Александр Сироткин",
  "александр сироткин": "Александр Сироткин",
  "кулагин алексей": "Алексей Кулагин",
  "алексей кулагин": "Алексей Кулагин",
  "ахметшин арслан": "Арслан Ахметшин",
  "арслан ахметшин": "Арслан Ахметшин",
};

/**
 * Пре-сейл → продажи при смене этапа пре-сейлом.
 * false = не менять стадию менеджера (только пре-сейл).
 */
window.ITMEN_STAGE_MAP_PRESALE_TO_SALES = {
  "Валидные клиенты на старте": false,
  "Функциональный голод до пилота": false,
  "Подготовка к пилоту": "Подготовка Пилота",
  "В процессе пилота": "Пилот",
  "Ожидаем отчет по итогам": "Ожидаем отчет по итогам",
  "Успех пилота": "Пилот Окончен",
  "Пауза": "На паузе",
  "Отказ": "Отказ",
};

/** Менеджер → пре-сейл: только эти стадии менеджера меняют пре-сейл */
window.ITMEN_SALES_STAGES_SYNC_TO_PRESALE = {
  "Встреча состоялась": "Валидные клиенты на старте",
  "Интерес  Выявлен": "Валидные клиенты на старте",
  "Предложение выслано": "Валидные клиенты на старте",
  "Подготовка Пилота": "Подготовка к пилоту",
  "Пилот": "В процессе пилота",
  "Ожидаем отчет по итогам": "Ожидаем отчет по итогам",
  "На паузе": "Пауза",
};

/** При отказе пре-сейла: как отразить в воронке продаж */
window.ITMEN_PRESALE_SALES_REJECT_MODES = {
  none: "Не менять стадию продаж",
  refusal: "Отказ в воронке продаж",
  pilot_fail: "Провал пилота (после пилота)",
};

/** Продажи → пре-сейл (для отображения, если этап пре-сейла не задан явно) */
window.ITMEN_STAGE_MAP_SALES_TO_PRESALE = {
  "Встреча состоялась": "Валидные клиенты на старте",
  "Интерес  Выявлен": "Валидные клиенты на старте",
  "Предложение выслано": "Валидные клиенты на старте",
  "Подготовка Пилота": "Подготовка к пилоту",
  "Пилот": "В процессе пилота",
  "Ожидаем отчет по итогам": "Ожидаем отчет по итогам",
  "Пилот Окончен": "Успех пилота",
  "На паузе": "Пауза",
};

window.ITMEN_PRESALE_LOSS_STAGES = new Set([window.ITMEN_PRESALE_STAGE_OTKAZ]);

window.ITMEN_PRESALE_LOSS_REQUIRES_COMMENT = new Set([
  "Провал пилота (функциональный)",
  "Провал до пилота (не функциональный)",
]);

window.ITMEN_PRESALE_EDITABLE_DEAL_KEYS = new Set([
  "presale", "techResearch", "pilotFeasibilityPct", "productFeasibilityPct",
  "pilotReqCount", "productReqCount",
]);

window.ITMEN_PRESALE_EDITABLE_TABS = new Set([
  "presale-main", "presale-events", "pilot-req", "product-req", "files",
]);

const WORKSPACE_STORAGE_KEY = "itmen_active_workspace";

function getWorkspaceTree() {
  return window.ITMEN_WORKSPACES || {};
}

function listWorkspacesFlat() {
  return Object.values(getWorkspaceTree());
}

function getWorkspace(id) {
  return getWorkspaceTree()[id] || getWorkspaceTree().sales;
}

function getDefaultWorkspaceId() {
  if (typeof hasRole === "function" && hasRole("presale") && !hasRole("manager")) return "presale";
  return "sales";
}

function getActiveWorkspaceId() {
  try {
    const id = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (id && getWorkspace(id)) return id;
  } catch (_) { /* ignore */ }
  return getDefaultWorkspaceId();
}

function setActiveWorkspaceId(id) {
  const ws = getWorkspace(id);
  if (!ws) return;
  localStorage.setItem(WORKSPACE_STORAGE_KEY, ws.id);
}

function isPresaleWorkspace(id) {
  return (id || getActiveWorkspaceId()) === "presale";
}

function isReferenceWorkspace(id) {
  const ws = getWorkspace(id || getActiveWorkspaceId());
  return ws?.kind === "reference";
}

function getReferenceWorkspaceConfig(id) {
  const ws = getWorkspace(id || getActiveWorkspaceId());
  if (ws?.kind !== "reference") return null;
  return ws;
}

function dealMatchesWorkspace(deal, wsId) {
  const ws = getWorkspace(wsId);
  if (!ws) return true;
  const dt = String(deal?.dealType || "").trim();
  if (ws.kind === "reference") return dt === ws.dealType;
  if (ws.id === "presale") {
    return typeof dealInPresaleFunnel === "function" ? dealInPresaleFunnel(deal) : true;
  }
  if (ws.id === "sales") return !dt.startsWith("ref:");
  return true;
}

function getWorkspaceDeals(deals, wsId) {
  const list = deals || (typeof state !== "undefined" ? state?.deals : []) || [];
  const id = wsId || getActiveWorkspaceId();
  return list.filter(d => dealMatchesWorkspace(d, id));
}

function referenceStageOptions(wsId) {
  const ws = getReferenceWorkspaceConfig(wsId);
  if (!ws) return [];
  const canonical = [];
  const add = s => {
    const v = String(s || "").trim();
    if (v && !canonical.includes(v)) canonical.push(v);
  };
  const listKey = ws.stagesListKey;
  (typeof state !== "undefined" ? state?.lists?.[listKey] : [])?.forEach(add);
  getWorkspaceDeals(null, ws.id).forEach(d => add(d.stage));
  return canonical;
}

function canonicalSalesStageSet() {
  return new Set((window.ITMEN_SALES_STAGES || []).map(s => String(s || "").trim()));
}

function salesStageOptions(extraStage) {
  const canonical = [...(window.ITMEN_SALES_STAGES || [])];
  const add = s => {
    const v = String(s || "").trim();
    if (v && !canonical.includes(v)) canonical.push(v);
  };
  const extra = String(extraStage || "").trim();
  if (extra) add(extra);
  if (!canonical.includes("Отказ")) add("Отказ");
  return canonical;
}

function presaleKanbanStageColumns() {
  const canonical = [];
  const add = s => {
    const v = String(s || "").trim();
    if (v && !canonical.includes(v)) canonical.push(v);
  };
  (state?.lists?.presale_stages || []).forEach(add);
  (window.ITMEN_PRESALE_FUNNEL_STAGES || []).forEach(add);
  return canonical;
}

function presaleStageOptions() {
  return presaleKanbanStageColumns();
}

function presaleFunnelStageOptions() {
  return presaleKanbanStageColumns();
}

function salesStageIndex(stage) {
  return salesStageOptions().indexOf(stage);
}

function mapAmoPresaleOwner(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const key = s.toLowerCase();
  if (window.ITMEN_AMO_PRESALE_OWNER_ALIASES?.[key]) {
    return window.ITMEN_AMO_PRESALE_OWNER_ALIASES[key];
  }
  const staff = window.ITMEN_INITIAL?.lists?.presale_owners || [];
  const exact = staff.find(n => n.toLowerCase() === key);
  if (exact) return exact;
  if (staff.includes(s)) return s;
  return "";
}

function inferPresaleOwnerFromDeal(deal) {
  const fromPresale = String(deal?.presale?.owner || "").trim();
  if (fromPresale) return fromPresale;
  return mapAmoPresaleOwner(deal?.capabilities);
}

function migratePresaleStageFields(presale) {
  const p = { ...(presale || {}) };
  const stage = String(p.stage || "").trim();
  const legacy = window.ITMEN_PRESALE_LEGACY_LOSS_STAGES || {};
  if (legacy[stage]) {
    p.stage = window.ITMEN_PRESALE_STAGE_OTKAZ;
    if (!p.lossReason) p.lossReason = legacy[stage];
  } else if (stage === "Успех без пилота") {
    p.stage = window.ITMEN_PRESALE_STAGE_SUCCESS;
    p.successWithoutPilot = true;
  }
  return p;
}

function mapSalesStageToPresale(salesStage) {
  return window.ITMEN_STAGE_MAP_SALES_TO_PRESALE?.[salesStage] ?? null;
}

function mapPresaleStageToSales(presaleStage) {
  const v = window.ITMEN_STAGE_MAP_PRESALE_TO_SALES?.[presaleStage];
  if (v === false) return null;
  return v ?? null;
}

function resolvePresaleStage(deal) {
  const presale = migratePresaleStageFields(deal?.presale || {});
  const rowStage = String(deal?.presale_stage || "").trim();
  if (rowStage) return rowStage;
  if (presale.stage) return presale.stage;
  return mapSalesStageToPresale(deal?.stage || "") || null;
}

function presaleOwnerForDeal(deal) {
  const rowOwner = String(deal?.presale_owner || "").trim();
  if (rowOwner) return rowOwner;
  const o = String(deal?.presale?.owner || "").trim();
  if (o) return o;
  return inferPresaleOwnerFromDeal(deal) || "";
}

function dealInPresaleFunnel(deal) {
  const presale = migratePresaleStageFields(deal?.presale || {});
  if (String(deal?.presale_stage || presale.stage || "").trim()) return true;
  if (presale.successWithoutPilot) return true;
  if (presaleOwnerForDeal(deal)) return true;
  const salesStage = deal?.stage || "";
  if (!salesStage || salesStage === "Взят в работу") return false;
  if (mapSalesStageToPresale(salesStage)) return true;
  if (["Провал пилота", "Финальный компред"].includes(salesStage)) return true;
  return false;
}

function getPresaleStaffNames() {
  const fromList = window.ITMEN_INITIAL?.lists?.presale_owners || [];
  const fromDeals = new Set();
  (state?.deals || []).forEach(d => {
    const o = presaleOwnerForDeal(d);
    if (o) fromDeals.add(o);
  });
  const self = typeof currentUserOwnerName === "function" ? currentUserOwnerName() : "";
  if (self) fromDeals.add(self);
  return [...new Set([...fromList, ...fromDeals])].sort((a, b) => a.localeCompare(b, "ru"));
}

function defaultPresaleBlock(deal) {
  return {
    stage: "",
    owner: inferPresaleOwnerFromDeal(deal) || "",
    successWithoutPilot: false,
    pilotStart: "",
    pilotEnd: "",
    distroIssueDate: "",
    distroEndDate: "",
    lossReason: "",
    lossComment: "",
    salesRejectMode: "none",
    kaitenCardId: null,
    kaitenCardUrl: "",
    kaitenSyncedAt: "",
    kaitenSyncError: "",
  };
}

function normalizePresaleBlock(raw, deal) {
  const base = defaultPresaleBlock(deal);
  if (!raw || typeof raw !== "object") return base;
  const merged = migratePresaleStageFields({
    ...base,
    ...raw,
    stage: raw.stage || "",
    owner: raw.owner || base.owner || inferPresaleOwnerFromDeal(deal) || "",
    successWithoutPilot: Boolean(raw.successWithoutPilot),
  });
  return merged;
}

window.getWorkspaceTree = getWorkspaceTree;
window.listWorkspacesFlat = listWorkspacesFlat;
window.getWorkspace = getWorkspace;
window.getDefaultWorkspaceId = getDefaultWorkspaceId;
window.getActiveWorkspaceId = getActiveWorkspaceId;
window.setActiveWorkspaceId = setActiveWorkspaceId;
window.isPresaleWorkspace = isPresaleWorkspace;
window.isReferenceWorkspace = isReferenceWorkspace;
window.getReferenceWorkspaceConfig = getReferenceWorkspaceConfig;
window.dealMatchesWorkspace = dealMatchesWorkspace;
window.getWorkspaceDeals = getWorkspaceDeals;
window.referenceStageOptions = referenceStageOptions;
window.salesStageOptions = salesStageOptions;
window.isManagerLockedSalesStage = isManagerLockedSalesStage;
window.managerSelectableStageOptions = managerSelectableStageOptions;
window.managerStageChangeBlocked = managerStageChangeBlocked;
window.presaleKanbanStageColumns = presaleKanbanStageColumns;
window.presaleStageOptions = presaleStageOptions;
window.presaleFunnelStageOptions = presaleFunnelStageOptions;
window.dealInPresaleFunnel = dealInPresaleFunnel;
window.resolvePresaleStage = resolvePresaleStage;
window.mapPresaleStageToSales = mapPresaleStageToSales;
window.mapSalesStageToPresale = mapSalesStageToPresale;
window.mapAmoPresaleOwner = mapAmoPresaleOwner;
window.presaleOwnerForDeal = presaleOwnerForDeal;
window.inferPresaleOwnerFromDeal = inferPresaleOwnerFromDeal;
window.migratePresaleStageFields = migratePresaleStageFields;
window.getPresaleStaffNames = getPresaleStaffNames;
window.normalizePresaleBlock = normalizePresaleBlock;
window.defaultPresaleBlock = defaultPresaleBlock;
