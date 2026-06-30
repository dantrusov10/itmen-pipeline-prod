"use strict";

const { getKaitenConfig, resolveKaitenColumnId, cardUrl } = require("./kaiten-config");
const { createCard, updateCard, setCardResponsible, clearCardResponsible } = require("./kaiten-client");
const { resolveKaitenUserIdForCrmOwner, resolveCrmOwnerName } = require("./kaiten-owners");
const { loadPresaleMap, savePresaleMap, normalizePresale, addPresaleEvent, syncPresaleFieldsToDealRow } = require("./presale-data");

const syncGuard = new Map();

function beginSync(dealId) {
  syncGuard.set(String(dealId || ""), Date.now());
}

function endSync(dealId) {
  syncGuard.delete(String(dealId || ""));
}

function isInboundBlocked(dealId) {
  const at = syncGuard.get(String(dealId || ""));
  if (!at) return false;
  return Date.now() - at < 5000;
}

function crmDealUrl(dealId) {
  const base = process.env.ITMEN_PUBLIC_URL || "https://itmen-pipeline.nwlvl.ru";
  return `${base.replace(/\/$/, "")}/#deal/${encodeURIComponent(dealId)}`;
}

function buildCardDescription(deal, presale, { pilotData, productData } = {}) {
  const lines = [
    `CRM: ${crmDealUrl(deal.id)}`,
    `ID: ${deal.id}`,
    deal.amoId ? `amo: ${deal.amoId}` : "",
    deal.customer ? `Клиент: ${deal.customer}` : "",
    deal.owner ? `Менеджер: ${deal.owner}` : "",
    presale?.owner ? `Пре-сейл: ${presale.owner}` : "",
    deal.amount ? `Сумма: ${deal.amount}` : "",
  ].filter(Boolean);
  let body = lines.join("\n");
  try {
    const { buildRequirementsDescriptionBlocks } = require("./kaiten-requirements-description");
    const reqBlock = buildRequirementsDescriptionBlocks(pilotData, productData);
    if (reqBlock) body = `${body}\n\n---\n\n${reqBlock}`;
  } catch (_) { /* optional */ }
  return body;
}

async function loadRequirementsForDescription(dealId) {
  try {
    const { listPilotRequirements, listProductRequirements } = require("./requirements");
    const [pilotData, productData] = await Promise.all([
      listPilotRequirements(dealId),
      listProductRequirements(dealId),
    ]);
    return { pilotData, productData };
  } catch (e) {
    console.warn("loadRequirementsForDescription", dealId, e.message);
    return { pilotData: null, productData: null };
  }
}

function buildCardProperties(presale) {
  const cfg = getKaitenConfig();
  const p = cfg.properties;
  const out = {};
  const putDate = (propId, iso) => {
    if (!propId || !iso) return;
    const d = String(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    out[`id_${propId}`] = { date: d, time: null, tzOffset: null };
  };
  putDate(p.pilotStart, presale?.pilotStart);
  putDate(p.pilotEnd, presale?.pilotEnd);
  putDate(p.distroIssueDate, presale?.distroIssueDate);
  putDate(p.distroEndDate, presale?.distroEndDate);
  return out;
}

function buildCardTitle(deal) {
  const customer = String(deal?.customer || "Без названия").trim();
  const id = String(deal?.id || "").trim();
  return id ? `${id} ${customer}` : customer;
}

function dealInPresaleFunnel(deal, presale) {
  const p = presale || {};
  if (String(p.stage || deal?.presale_stage || "").trim()) return true;
  if (p.kaitenCardId) return true;
  const salesStage = deal?.stage || "";
  const enter = [
    "Встреча состоялась", "Интерес  Выявлен", "Предложение выслано",
    "Подготовка Пилота", "Пилот", "Ожидаем отчет по итогам", "Пилот Окончен",
    "Провал пилота", "На паузе", "Финальный компред",
  ];
  return enter.includes(salesStage);
}

async function persistKaitenLink(dealId, presale, { cardId, cardUrl: url, error = "" }) {
  const map = await loadPresaleMap();
  const prev = normalizePresale(map[dealId]);
  const next = {
    ...prev,
    ...presale,
    kaitenCardId: cardId || prev.kaitenCardId || null,
    kaitenCardUrl: url || (cardId ? cardUrl(cardId) : prev.kaitenCardUrl || ""),
    kaitenSyncedAt: new Date().toISOString(),
    kaitenSyncError: error || "",
    updatedAt: new Date().toISOString(),
  };
  map[dealId] = next;
  await savePresaleMap(map);
  await syncPresaleFieldsToDealRow(dealId, { stage: next.stage, owner: next.owner });
  return next;
}

async function syncDealToKaiten(dealId, deal, presale, { savedBy = "crm", forceCreate = false } = {}) {
  const cfg = getKaitenConfig();
  if (!cfg.enabled) return presale;
  if (!dealInPresaleFunnel(deal, presale)) return presale;

  beginSync(dealId);
  try {
    let cardId = presale?.kaitenCardId || null;
    const columnId = resolveKaitenColumnId(presale);
    const properties = buildCardProperties(presale);
    const { pilotData, productData } = await loadRequirementsForDescription(dealId);
    const description = buildCardDescription(deal, presale, { pilotData, productData });
    const title = buildCardTitle(deal);
    const crmOwner = resolveCrmOwnerName(presale?.owner);
    const ownerId = resolveKaitenUserIdForCrmOwner(crmOwner);

    if (!cardId) {
      const created = await createCard({
        title,
        board_id: cfg.boardId,
        column_id: columnId || cfg.stageColumns["Валидные клиенты на старте"],
        description,
        properties,
      });
      cardId = created?.id;
      if (cardId && ownerId) {
        try { await setCardResponsible(cardId, ownerId); } catch (_) {}
      }
      const linked = await persistKaitenLink(dealId, presale, { cardId, cardUrl: cardUrl(cardId) });
      await addPresaleEvent(dealId, {
        type: "system",
        body: "Создана карточка Kaiten",
        author: savedBy,
        meta: { kaitenCardId: cardId, kaitenCardUrl: cardUrl(cardId) },
      });
      return linked;
    }

    const patch = { title, description, properties };
    if (columnId) patch.column_id = columnId;
    await updateCard(cardId, patch);
    try {
      if (ownerId) await setCardResponsible(cardId, ownerId);
      else await clearCardResponsible(cardId);
    } catch (_) {}
    return persistKaitenLink(dealId, presale, {
      cardId,
      cardUrl: cardUrl(cardId),
      error: "",
    });
  } catch (e) {
    const errMsg = String(e.message || e);
    const linked = await persistKaitenLink(dealId, presale, {
      cardId: presale?.kaitenCardId || null,
      cardUrl: presale?.kaitenCardUrl || "",
      error: errMsg,
    });
    try {
      await addPresaleEvent(dealId, {
        type: "system",
        body: `Ошибка синхронизации Kaiten: ${errMsg}`,
        author: savedBy || "crm",
      });
    } catch (_) { /* ignore */ }
    return linked;
  } finally {
    endSync(dealId);
  }
}

async function syncCommentToKaiten(dealId, presale, event) {
  const cfg = getKaitenConfig();
  if (!cfg.enabled) return;
  const cardId = presale?.kaitenCardId;
  if (!cardId) return;
  const type = String(event?.type || "comment");
  if (type === "kaiten_comment" || type === "system") return;
  const body = String(event?.body || "").trim();
  if (!body) return;
  beginSync(dealId);
  try {
    const { createCardComment } = require("./kaiten-client");
    await createCardComment(cardId, body, { authorName: String(event?.author || "CRM").trim() || "CRM" });
  } catch (e) {
    console.warn("kaiten comment out", dealId, e.message);
  } finally {
    endSync(dealId);
  }
}

async function ensureKaitenCardForDeal(dealId, deal, presale, opts = {}) {
  return syncDealToKaiten(dealId, deal, presale, opts);
}

async function syncDealToKaitenAfterRequirements(dealId, dealHint) {
  const { loadPipelineState } = require("./mapper");
  const { getPresaleForDeal } = require("./presale-data");
  const deal = dealHint || await loadPipelineState({ dealId, includeArchived: true });
  if (!deal) return null;
  const presale = await getPresaleForDeal(dealId, deal);
  return syncDealToKaiten(dealId, deal, presale, { savedBy: "requirements" });
}

module.exports = {
  syncDealToKaiten,
  syncCommentToKaiten,
  ensureKaitenCardForDeal,
  syncDealToKaitenAfterRequirements,
  dealInPresaleFunnel,
  isInboundBlocked,
  buildCardTitle,
  buildCardDescription,
  crmDealUrl,
};
