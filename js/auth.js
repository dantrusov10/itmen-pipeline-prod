/* Авторизация менеджеров / администратора (PocketBase backend) */
const AUTH_STORAGE_KEY = "itmen_pipeline_auth_v1";

window.ITMEN_AUTH = {
  user: null,
  token: null,
};

const AUTH_CHANNEL = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("itmen_pipeline_auth_v1")
  : null;

function escapeAuthHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function authRequired() {
  return window.ITMEN_API?.backend === "pocketbase";
}

function loadAuthFromStorage() {
  try {
    let raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) localStorage.setItem(AUTH_STORAGE_KEY, raw);
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applyAuthSession(session) {
  if (!session?.token) {
    window.ITMEN_AUTH.user = null;
    window.ITMEN_AUTH.token = null;
    return;
  }
  window.ITMEN_AUTH.user = session.user;
  window.ITMEN_AUTH.token = session.token;
}

function broadcastAuth(session) {
  try {
    AUTH_CHANNEL?.postMessage({ type: session?.token ? "login" : "logout", session });
  } catch (_) {}
}

function persistAuth(session, { broadcast = true } = {}) {
  if (!session?.token) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    applyAuthSession(null);
    if (broadcast) broadcastAuth(null);
    return;
  }
  const raw = JSON.stringify(session);
  localStorage.setItem(AUTH_STORAGE_KEY, raw);
  sessionStorage.setItem(AUTH_STORAGE_KEY, raw);
  applyAuthSession(session);
  if (broadcast) broadcastAuth(session);
}

function hydrateAuthFromStorage() {
  const cached = loadAuthFromStorage();
  if (cached?.token) applyAuthSession(cached);
}

function authHeaders() {
  const token = window.ITMEN_AUTH?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isAdmin() {
  return window.ITMEN_AUTH?.user?.role === "admin";
}

function canEditDeal(deal) {
  const user = window.ITMEN_AUTH?.user;
  if (!user) return false;
  if (user.role === "admin") return true;
  return isDealOwnedByCurrentUser(deal);
}

function canDeleteDeal(deal) {
  return canEditDeal(deal);
}

function currentUserOwnerName() {
  const u = window.ITMEN_AUTH?.user;
  if (!u) return "";
  return String(u.managerName || u.displayName || "").trim();
}

function isDealOwnedByCurrentUser(deal) {
  const self = currentUserOwnerName();
  if (!self) return false;
  const owner = String(deal?.owner || "").trim();
  if (!owner) return false;
  if (typeof ownerNamesMatch === "function") return ownerNamesMatch(owner, self);
  return owner.normalize("NFC").toLowerCase() === self.normalize("NFC").toLowerCase();
}

window.currentUserOwnerName = currentUserOwnerName;
window.isDealOwnedByCurrentUser = isDealOwnedByCurrentUser;

async function apiAuthLogin(email, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка входа");
  persistAuth({ token: data.token, user: data.user });
  return data;
}

function isAuthExpiredError(res, data) {
  if (res?.status === 401) return true;
  const msg = String(data?.error || "").toLowerCase();
  return /сессия истекла|unauthorized|invalid token|jwt/i.test(msg);
}

async function apiAuthMe(attempt = 0) {
  let res;
  try {
    res = await fetch("/api/auth/me", {
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
  } catch (e) {
    const net = /failed to fetch|networkerror|load failed/i.test(String(e.message || e));
    if (net && attempt < 2) {
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      return apiAuthMe(attempt + 1);
    }
    if (window.ITMEN_AUTH?.token && window.ITMEN_AUTH?.user) {
      return window.ITMEN_AUTH.user;
    }
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isAuthExpiredError(res, data)) {
      throw new Error(data.error || "Сессия истекла");
    }
    if (window.ITMEN_AUTH?.token && window.ITMEN_AUTH?.user) {
      return window.ITMEN_AUTH.user;
    }
    throw new Error(data.error || "Ошибка проверки сессии");
  }
  persistAuth({ token: window.ITMEN_AUTH.token, user: data.user }, { broadcast: false });
  return data.user;
}

function logoutAuth() {
  persistAuth(null);
  if (authRequired()) location.reload();
}

async function ensureAuthSession() {
  if (!authRequired()) return true;
  const cached = loadAuthFromStorage();
  if (cached?.token) {
    applyAuthSession(cached);
    try {
      await apiAuthMe();
      return true;
    } catch (e) {
      if (/сессия истекла/i.test(String(e.message || ""))) {
        persistAuth(null);
      } else if (cached.user) {
        return true;
      }
    }
  }
  return showLoginModal();
}

function onAuthStorageSync(raw) {
  if (!raw) {
    applyAuthSession(null);
    if (typeof renderAuthTopbar === "function") renderAuthTopbar();
    return;
  }
  try {
    const session = JSON.parse(raw);
    if (!session?.token) return;
    applyAuthSession(session);
    if (typeof renderAuthTopbar === "function") renderAuthTopbar();
  } catch (_) {}
}

window.addEventListener("storage", (e) => {
  if (e.key !== AUTH_STORAGE_KEY) return;
  onAuthStorageSync(e.newValue);
});

AUTH_CHANNEL?.addEventListener("message", (e) => {
  const msg = e.data;
  if (!msg?.type) return;
  if (msg.type === "login" && msg.session?.token) {
    persistAuth(msg.session, { broadcast: false });
    if (typeof renderAuthTopbar === "function") renderAuthTopbar();
  } else if (msg.type === "logout") {
    applyAuthSession(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    if (typeof renderAuthTopbar === "function") renderAuthTopbar();
  }
});

function renderAuthTopbar() {
  const slot = document.getElementById("topbar-tools") || document.querySelector(".topbar-right") || document.querySelector(".topbar > div");
  if (!slot || !authRequired()) return;
  let el = document.getElementById("auth-user-bar");
  if (!el) {
    el = document.createElement("div");
    el.id = "auth-user-bar";
    el.className = "topbar-auth";
    slot.appendChild(el);
  }
  const u = window.ITMEN_AUTH.user;
  if (!u) {
    el.innerHTML = `<button type="button" class="btn btn-sm" id="auth-login-btn">Войти</button>`;
    document.getElementById("auth-login-btn")?.addEventListener("click", () => showLoginModal());
    return;
  }
  const roleLabel = (() => {
    const roles = typeof parseUserRoles === "function" ? parseUserRoles(u) : [u.role];
    if (roles.includes("admin")) return "админ";
    if (roles.includes("manager") && roles.includes("presale")) return "менеджер+пре-сейл";
    if (roles.includes("presale")) return "пре-сейл";
    return "менеджер";
  })();
  el.innerHTML = `
    <span class="muted">${escapeAuthHtml(u.displayName || u.email)} · ${roleLabel}</span>
    <button type="button" class="btn btn-sm" id="auth-logout-btn">Выйти</button>`;
  document.getElementById("auth-logout-btn")?.addEventListener("click", logoutAuth);
  if (typeof renderNavLinks === "function") renderNavLinks();
}

function showLoginModal() {
  return new Promise(resolve => {
    let overlay = document.getElementById("auth-modal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "auth-modal";
      overlay.className = "modal-overlay open";
      overlay.innerHTML = `
        <div class="modal" style="max-width:420px">
          <div class="modal-header"><h3>Вход в пайплайн</h3></div>
          <div class="modal-body">
            <p class="muted" style="font-size:.85rem;margin-bottom:1rem">
              Менеджеры видят все сделки, редактируют только свои. Дашборд доступен всем.
            </p>
            <div class="form-grid" style="grid-template-columns:1fr">
              <div><label>Email</label><input id="auth-email" type="email" autocomplete="username"></div>
              <div><label>Пароль</label><input id="auth-password" type="password" autocomplete="current-password"></div>
            </div>
            <p id="auth-error" class="muted" style="color:#b45309;font-size:.82rem;min-height:1.2em;margin-top:.5rem"></p>
            <div style="margin-top:1rem;display:flex;gap:.5rem;justify-content:flex-end">
              <button type="button" class="btn btn-primary" id="auth-submit">Войти</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    } else {
      overlay.classList.add("open");
    }

    const submit = async () => {
      const errEl = document.getElementById("auth-error");
      errEl.textContent = "";
      try {
        await apiAuthLogin(
          document.getElementById("auth-email").value.trim(),
          document.getElementById("auth-password").value,
        );
        overlay.classList.remove("open");
        renderAuthTopbar();
        if (typeof syncPipelineFromServerAndRefresh === "function") {
          syncPipelineFromServerAndRefresh().catch(console.error);
        } else if (typeof renderAll === "function") {
          renderAll();
        }
        resolve(true);
      } catch (e) {
        errEl.textContent = e.message || "Ошибка входа";
      }
    };

    document.getElementById("auth-submit").onclick = submit;
    document.getElementById("auth-password").onkeydown = e => {
      if (e.key === "Enter") submit();
    };
  });
}

function applyDealModalReadOnly(canEdit) {
  const modal = document.getElementById("deal-modal");
  if (!modal) return;
  modal.classList.toggle("deal-readonly", !canEdit);
  const saveBtn = modal.querySelector(".modal-header-actions .btn-primary");
  if (saveBtn) saveBtn.hidden = !canEdit;
  modal.querySelector(".deal-readonly-banner")?.remove();
  if (!canEdit) {
    const banner = document.createElement("div");
    banner.className = "deal-readonly-banner";
    banner.style.cssText = "background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:.45rem 1rem;font-size:.82rem;color:#1e3a5f";
    banner.textContent = "Только просмотр — редактировать можно только свои сделки";
    modal.querySelector(".modal-body")?.before(banner);
  }
  modal.querySelectorAll("input, select, textarea").forEach(el => {
    if (el.id === "f-id") return;
    el.disabled = !canEdit;
  });
  modal.querySelectorAll(".modal-body button").forEach(el => {
    el.disabled = !canEdit;
  });
}

hydrateAuthFromStorage();

window.canEditDeal = canEditDeal;
window.canDeleteDeal = canDeleteDeal;
window.isAdmin = isAdmin;
window.ensureAuthSession = ensureAuthSession;
window.renderAuthTopbar = renderAuthTopbar;
window.authHeaders = authHeaders;
