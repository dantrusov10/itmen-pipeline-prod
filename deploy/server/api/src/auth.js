"use strict";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8095";

async function pbUserFetch(path, token, opts = {}) {
  const auth = token ? (token.startsWith("Bearer ") ? token : `Bearer ${token}`) : "";
  const res = await fetch(`${PB_URL}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.message || res.statusText || "Auth error");
    err.status = res.status;
    throw err;
  }
  return data;
}

async function loginUser(email, password) {
  const data = await pbUserFetch("/api/collections/pipeline_users/auth-with-password", null, {
    method: "POST",
    body: { identity: email, password },
  });
  return {
    token: data.token,
    user: normalizeUser(data.record),
  };
}

async function refreshUser(token) {
  const data = await pbUserFetch("/api/collections/pipeline_users/auth-refresh", token, {
    method: "POST",
  });
  return {
    token: data.token,
    user: normalizeUser(data.record),
  };
}

function parseUserRoles(user) {
  if (!user) return [];
  if (user.roles?.length) return user.roles;
  const r = String(user.role || "manager").toLowerCase();
  if (r === "admin") return ["admin", "manager", "presale"];
  if (r === "manager_presale" || r === "manager+presale") return ["manager", "presale"];
  if (r === "presale") return ["presale"];
  return ["manager"];
}

function userHasRole(user, role) {
  const roles = parseUserRoles(user);
  if (roles.includes("admin")) return true;
  return roles.includes(role);
}

function normalizeUser(record) {
  if (!record) return null;
  const role = record.role || "manager";
  return {
    id: record.id,
    email: record.email,
    role,
    roles: parseUserRoles({ role }),
    managerName: record.manager_name || "",
    displayName: record.display_name || record.manager_name || record.email,
  };
}

function parseBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : (h || null);
}

function requireAuth(loadUser = true) {
  return async (req, res, next) => {
    const token = parseBearer(req);
    if (!token) return res.status(401).json({ error: "Требуется вход в систему" });
    try {
      if (loadUser) {
        const { user } = await refreshUser(token);
        req.user = user;
        req.userToken = token;
      } else {
        req.userToken = token;
      }
      next();
    } catch (e) {
      res.status(401).json({ error: "Сессия истекла — войдите снова" });
    }
  };
}

function requireAdmin(req, res, next) {
  if (userHasRole(req.user, "admin")) return next();
  return res.status(403).json({ error: "Доступно только администратору" });
}

function canEditSalesDeal(user, deal) {
  if (!user || !deal) return false;
  if (user.role === "admin" || userHasRole(user, "admin")) return true;
  if (!userHasRole(user, "manager")) return false;
  const self = String(user.managerName || user.displayName || "").trim();
  const owner = String(deal.owner || "").trim();
  return Boolean(self && owner && owner.normalize("NFC").toLowerCase() === self.normalize("NFC").toLowerCase());
}

function canEditPresaleDeal(user, deal) {
  if (!user || !deal) return false;
  if (user.role === "admin" || userHasRole(user, "admin")) return true;
  return userHasRole(user, "presale");
}

function canEditDeal(user, deal) {
  return canEditSalesDeal(user, deal) || canEditPresaleDeal(user, deal);
}

function canDeleteDeal(user, deal) {
  if (user?.role === "admin" || userHasRole(user, "admin")) return true;
  return canEditSalesDeal(user, deal);
}

function resolveTaskAssignee(user, requested) {
  if (!user) return "";
  const req = String(requested || "").trim();
  if (user.role === "admin") return req;
  const self = String(user.managerName || "").trim();
  if (!self) return req;
  if (req && req !== self) {
    const err = new Error("Менеджер может назначать задачи только на себя");
    err.status = 403;
    throw err;
  }
  return self;
}

module.exports = {
  loginUser,
  refreshUser,
  normalizeUser,
  parseUserRoles,
  userHasRole,
  requireAuth,
  requireAdmin,
  canEditDeal,
  canEditSalesDeal,
  canEditPresaleDeal,
  canDeleteDeal,
  resolveTaskAssignee,
};
