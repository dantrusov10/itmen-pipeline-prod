/* API-клиент: Google Apps Script (GitHub Pages) или локальный Express */
(function () {
  const gasUrl = window.ITMEN_GAS_CONFIG?.url || "";
  const hasGas = gasUrl && !gasUrl.includes("PASTE_YOUR");
  const onGhPages = /\.github\.io$/i.test(location.hostname);
  const onLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  let backend = "local";
  if (hasGas && (onGhPages || window.ITMEN_FORCE_GAS || !onLocal)) backend = "gas";
  else if (onLocal) backend = "express";

  window.ITMEN_API = {
    enabled: backend === "gas" || backend === "express",
    backend,
    gasUrl: hasGas ? gasUrl : "",
    needsGasSetup: onGhPages && !hasGas,
    base: "",
  };
})();

async function gasFetch(payload) {
  const url = window.ITMEN_API.gasUrl;
  const res = await fetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Apps Script вернул некорректный ответ. Проверьте развёртывание (доступ «Все»).");
  }
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(window.ITMEN_API.base + path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiLoadPipeline() {
  if (window.ITMEN_API.backend === "gas") {
    const res = await fetch(`${window.ITMEN_API.gasUrl}?action=get`, { redirect: "follow" });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Не удалось прочитать ответ Google Таблицы. Проверьте URL в js/gas-config.js");
    }
    if (data.error) throw new Error(data.error);
    return data.state || null;
  }
  const { state } = await apiFetch("/api/pipeline");
  return state;
}

async function apiSavePipeline(state, meta = {}) {
  if (window.ITMEN_API.backend === "gas") {
    return gasFetch({
      action: "save",
      state,
      editedDealIds: meta.editedDealIds || [],
      deletedDealIds: meta.deletedDealIds || [],
      baseSavedAt: meta.baseSavedAt || null,
      forceFull: !!meta.forceFull,
    });
  }
  return apiFetch("/api/pipeline", {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
}

async function apiListManagers() {
  if (window.ITMEN_API.backend === "gas") {
    const res = await fetch(`${window.ITMEN_API.gasUrl}?action=managers`, { redirect: "follow" });
    const data = JSON.parse(await res.text());
    if (data.error) throw new Error(data.error);
    return data;
  }
  return apiFetch("/api/managers");
}

function apiBackendLabel() {
  if (window.ITMEN_API.backend === "gas") return "Google Таблица";
  if (window.ITMEN_API.backend === "express") return "сервер";
  return "этот браузер";
}

function showSetupBanner() {
  if (!window.ITMEN_API?.needsGasSetup) return;
  const bar = document.createElement("div");
  bar.id = "setup-banner";
  bar.style.cssText = "background:#fff3cd;border-bottom:1px solid #ffc107;padding:.6rem 1rem;font-size:.85rem;color:#664d03";
  bar.innerHTML = `⚠️ <strong>Google Таблица не подключена.</strong> Данные пока только в этом браузере. 
    Подключите Apps Script — инструкция в 
    <a href="https://github.com/dantrusov10/itmen-pipeline/blob/master/DEPLOY_GAS.md" target="_blank">DEPLOY_GAS.md</a>
    (шаги 1–2: таблица + URL в js/gas-config.js).`;
  document.body.prepend(bar);
}
