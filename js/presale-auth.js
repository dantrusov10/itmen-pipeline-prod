/* Права доступа: роли, пространства, пре-сейл */
function parseUserRoles(user) {
  if (!user) return [];
  if (user.roles?.length) return user.roles;
  const r = String(user.role || "manager").toLowerCase();
  if (r === "admin") return ["admin", "manager", "presale"];
  if (r === "manager_presale" || r === "manager+presale") return ["manager", "presale"];
  if (r === "presale") return ["presale"];
  return ["manager"];
}

function hasRole(role) {
  const roles = parseUserRoles(window.ITMEN_AUTH?.user);
  if (roles.includes("admin")) return true;
  return roles.includes(role);
}

function isPresaleUser() {
  return hasRole("presale");
}

function isManagerUser() {
  return hasRole("manager");
}

function isPresaleOnlyUser() {
  return isPresaleUser() && !isManagerUser() && !isAdmin();
}

function normalizeOwnerName(name) {
  return String(name || "").trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}

function ownerNamesMatch(a, b) {
  const na = normalizeOwnerName(a);
  const nb = normalizeOwnerName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aliases = window.ITMEN_AMO_PRESALE_OWNER_ALIASES || {};
  const ca = aliases[na] ? normalizeOwnerName(aliases[na]) : na;
  const cb = aliases[nb] ? normalizeOwnerName(aliases[nb]) : nb;
  return ca === cb;
}

function isDealPresaleOwner(deal) {
  const self = currentUserOwnerName();
  if (!self) return false;
  const owner = typeof presaleOwnerForDeal === "function"
    ? presaleOwnerForDeal(deal)
    : String(deal?.presale?.owner || deal?.presaleOwner || "").trim();
  if (!owner) return isPresaleUser();
  return ownerNamesMatch(owner, self);
}

function isDealPresaleOwnerStrict(deal) {
  const self = currentUserOwnerName();
  if (!self) return false;
  const owner = typeof presaleOwnerForDeal === "function"
    ? presaleOwnerForDeal(deal)
    : String(deal?.presale?.owner || deal?.presaleOwner || deal?.presale_owner || "").trim();
  if (!owner) return false;
  return ownerNamesMatch(owner, self);
}

function isDealMineForCurrentUser(deal) {
  if (!deal) return false;
  const self = currentUserOwnerName();
  if (!self) return false;
  const presaleOwner = typeof presaleOwnerForDeal === "function"
    ? String(presaleOwnerForDeal(deal) || "").trim()
    : String(deal?.presale?.owner || deal?.presale_owner || "").trim();
  if (presaleOwner && ownerNamesMatch(presaleOwner, self)) return true;
  const mgr = String(deal?.owner || "").trim();
  return Boolean(mgr && ownerNamesMatch(mgr, self));
}

function canViewDeal(deal) {
  if (!window.ITMEN_AUTH?.user) return !authRequired();
  return true;
}

function canEditSalesDeal(deal) {
  const user = window.ITMEN_AUTH?.user;
  if (!user) return false;
  if (user.role === "admin" || hasRole("admin")) return true;
  if (!isManagerUser()) return false;
  return isDealOwnedByCurrentUser(deal);
}

function canEditPresaleDeal(deal) {
  const user = window.ITMEN_AUTH?.user;
  if (!user) return false;
  if (user.role === "admin" || hasRole("admin")) return true;
  return isPresaleUser();
}

function canEditDeal(deal) {
  return canEditSalesDeal(deal) || canEditPresaleDeal(deal);
}

function canEditDealTab(tabId, deal) {
  const d = deal || window.__currentDealPage;
  if (isAdmin()) return true;
  const presaleTabs = typeof ITMEN_PRESALE_EDITABLE_TABS !== "undefined"
    ? ITMEN_PRESALE_EDITABLE_TABS
    : new Set(["presale-main", "presale-events", "pilot-req", "product-req", "files"]);
  if (presaleTabs.has(tabId)) return canEditPresaleDeal(d);
  if (isPresaleUser() && (tabId === "passport" || tabId === "scoring" || tabId === "events")) {
    return canEditPresaleDeal(d);
  }
  return canEditSalesDeal(d);
}

function canDeleteDeal(deal) {
  if (isAdmin()) return true;
  return canEditSalesDeal(deal);
}

window.canEditDeal = canEditDeal;
window.canDeleteDeal = canDeleteDeal;
window.parseUserRoles = parseUserRoles;
window.hasRole = hasRole;
window.isPresaleUser = isPresaleUser;
window.isManagerUser = isManagerUser;
window.isPresaleOnlyUser = isPresaleOnlyUser;
window.isDealMineForCurrentUser = isDealMineForCurrentUser;
window.ownerNamesMatch = ownerNamesMatch;
window.isDealPresaleOwner = isDealPresaleOwner;
window.canViewDeal = canViewDeal;
window.canEditSalesDeal = canEditSalesDeal;
window.canEditPresaleDeal = canEditPresaleDeal;
window.canEditDealTab = canEditDealTab;
