/* API-клиент — синхронизация с сервером */
window.ITMEN_API = {
  enabled: true,
  base: "",
  user: null,
};

async function apiFetch(path, opts = {}) {
  const res = await fetch(window.ITMEN_API.base + path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiLogin(login, pin) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, pin }),
  });
}

async function apiLogout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

async function apiLoadPipeline() {
  const { state, user } = await apiFetch("/api/pipeline");
  window.ITMEN_API.user = user;
  return state;
}

async function apiSavePipeline(state) {
  return apiFetch("/api/pipeline", {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
}

async function apiGetMe() {
  const { user } = await apiFetch("/api/auth/me");
  window.ITMEN_API.user = user;
  return user;
}

async function apiListManagers() {
  return apiFetch("/api/managers");
}
