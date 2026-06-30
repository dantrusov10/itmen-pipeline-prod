"use strict";

const { getKaitenConfig, resolveKaitenUserId, resolveKaitenUserName, normalizePersonName } = require("./kaiten-config");

const DEFAULT_PRESALE_OWNER = "Трусов Данила";
const DEFAULT_KAITEN_USER_ID = 673958;

function resolveCrmOwnerFromKaitenUserId(userId) {
  if (!userId) return "";
  const name = resolveKaitenUserName(Number(userId));
  return name || DEFAULT_PRESALE_OWNER;
}

/** Нормализует имя для CRM: известный сотрудник или Трусов по умолчанию. Пусто → пусто. */
function resolveCrmOwnerName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  const id = resolveKaitenUserId(n);
  if (id) return resolveKaitenUserName(id) || DEFAULT_PRESALE_OWNER;
  return DEFAULT_PRESALE_OWNER;
}

/** Kaiten user id для CRM owner; пустой owner → null (ничья карточка). */
function resolveKaitenUserIdForCrmOwner(ownerName) {
  const n = String(ownerName || "").trim();
  if (!n) return null;
  return resolveKaitenUserId(n) || DEFAULT_KAITEN_USER_ID;
}

function readResponsibleUserId(card) {
  const members = Array.isArray(card?.members) ? card.members : [];
  const responsible = members.find(m => Number(m.type) === 2)
    || members.find(m => Number(m.type) === 1)
    || members[0];
  if (responsible?.user_id) return Number(responsible.user_id);
  if (responsible?.id && !responsible?.card_id) return Number(responsible.id);
  if (card?.owner?.id) return Number(card.owner.id);
  if (card?.owner_id) return Number(card.owner_id);
  return null;
}

module.exports = {
  DEFAULT_PRESALE_OWNER,
  DEFAULT_KAITEN_USER_ID,
  resolveCrmOwnerFromKaitenUserId,
  resolveCrmOwnerName,
  resolveKaitenUserIdForCrmOwner,
  readResponsibleUserId,
  normalizePersonName,
};
