/* API-клиент: PocketBase (nwlvl.ru), Google Apps Script (GitHub Pages) или локальный Express */
(function () {
  const cfg = window.ITMEN_GAS_CONFIG || {};
  const gasUrl = cfg.url || "";
  const hasGas = gasUrl && !gasUrl.includes("PASTE_YOUR");
  const onGhPages = /\.github\.io$/i.test(location.hostname);
  const onItmenHost = /itmen-pipeline\.nwlvl\.ru$/i.test(location.hostname);
  const onLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const forcePb = cfg.usePocketBase === true || window.ITMEN_FORCE_PB;
  const forceGas = window.ITMEN_FORCE_GAS;

  let backend = "local";
  if (onItmenHost && forcePb !== false && !forceGas) backend = "pocketbase";
  else if (hasGas && (onGhPages || forceGas || !onLocal)) backend = "gas";
  else if (onLocal) backend = "express";

  window.ITMEN_API = {
    enabled: backend === "gas" || backend === "express" || backend === "pocketbase",
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

let pipelineInflight = null;

async function apiFetch(path, opts = {}, attempt = 0) {
  const isPipeline = /\/api\/pipeline/.test(path);
  const maxAttempts = isPipeline ? 4 : 2;
  const auth = typeof authHeaders === "function" ? authHeaders() : {};
  const { headers: extraHeaders, ...restOpts } = opts;
  let res;
  try {
    res = await fetch(window.ITMEN_API.base + path, {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...auth,
        ...(extraHeaders || {}),
      },
      ...restOpts,
    });
  } catch (e) {
    const net = /failed to fetch|networkerror|load failed/i.test(String(e.message || e));
    if (net && attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, (isPipeline ? 1000 : 600) * (attempt + 1)));
      return apiFetch(path, opts, attempt + 1);
    }
    throw new Error(net
      ? "Нет связи с сервером — повторите загрузку"
      : (e.message || "Ошибка сети"));
  }
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Некорректный ответ сервера (${res.status}, ${text.length} байт)`);
    }
  } else if (res.status === 304) {
    throw new Error("Кэш ответа устарел — повторите загрузку");
  }
  if (!res.ok) {
    if (res.status === 401 && typeof persistAuth === "function") persistAuth(null);
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function apiLoadPipeline(opts = {}) {
  const lite = opts.lite !== false && (window.ITMEN_API?.backend === "gas" || window.ITMEN_API?.backend === "pocketbase");
  const inflightKey = `${window.ITMEN_API?.backend || ""}:${lite ? "lite" : "full"}`;
  if (pipelineInflight?.key === inflightKey) return pipelineInflight.promise;
  const promise = apiLoadPipelineInner(opts, lite);
  pipelineInflight = { key: inflightKey, promise };
  try {
    return await promise;
  } finally {
    if (pipelineInflight?.promise === promise) pipelineInflight = null;
  }
}

async function apiLoadPipelineInner(opts, lite) {
  if (window.ITMEN_API.backend === "gas") {
    const action = lite ? "getLite" : "get";
    const res = await fetch(`${window.ITMEN_API.gasUrl}?action=${action}`, { redirect: "follow" });
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
  if (window.ITMEN_API.backend === "pocketbase") {
    const q = lite ? "?lite=1" : "";
    const { state } = await apiFetch(`/api/pipeline${q}`);
    return state || null;
  }
  const { state } = await apiFetch("/api/pipeline");
  return state;
}

async function apiLoadDeal(dealId) {
  if (window.ITMEN_API.backend === "gas") {
    const res = await fetch(
      `${window.ITMEN_API.gasUrl}?action=getDeal&dealId=${encodeURIComponent(dealId)}`,
      { redirect: "follow" }
    );
    const data = JSON.parse(await res.text());
    if (data.error) throw new Error(data.error);
    return data.deal || null;
  }
  if (window.ITMEN_API.backend === "pocketbase") {
    const { deal } = await apiFetch(`/api/pipeline/deals/${encodeURIComponent(dealId)}`);
    return deal || null;
  }
  const { state } = await apiFetch("/api/pipeline");
  return (state?.deals || []).find(d => d.id === dealId) || null;
}

async function apiSaveDeal(deal) {
  if (window.ITMEN_API.backend === "pocketbase") {
    const res = await apiFetch(`/api/deals/${encodeURIComponent(deal.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        deal,
        baseDataEpoch: deal._dataEpoch ?? state._dataEpoch ?? null,
      }),
    });
    if (res?.dataEpoch != null && state) state._dataEpoch = res.dataEpoch;
    return res;
  }
  return apiSavePipeline(
    { ...state, deals: state.deals.map(d => (d.id === deal.id ? deal : d)) },
    { editedDealIds: [deal.id] },
  );
}

async function apiDeleteDeal(dealId, opts = {}) {
  if (window.ITMEN_API.backend === "pocketbase") {
    const q = opts.hard ? "?hard=1" : "";
    return apiFetch(`/api/deals/${encodeURIComponent(dealId)}${q}`, { method: "DELETE" });
  }
  return apiSavePipeline(state, { deletedDealIds: [dealId] });
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
  if (window.ITMEN_API.backend === "pocketbase" && meta.editedDealIds?.length === 1 && !meta.forceFull) {
    const deal = (state.deals || []).find(d => d.id === meta.editedDealIds[0]);
    if (deal) return apiSaveDeal(deal);
  }
  return apiFetch("/api/pipeline", {
    method: "PUT",
    body: JSON.stringify({
      state,
      editedDealIds: meta.editedDealIds || [],
      deletedDealIds: meta.deletedDealIds || [],
      baseSavedAt: meta.baseSavedAt || state._savedAt || null,
      baseDataEpoch: meta.baseDataEpoch ?? state._dataEpoch ?? null,
      forceFull: !!meta.forceFull,
    }),
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
  if (window.ITMEN_API.backend === "pocketbase") return "PocketBase";
  if (window.ITMEN_API.backend === "gas") {
    if (/itmen-pipeline\.nwlvl\.ru$/i.test(location.hostname)) return "сервер (GAS staging)";
    return "Google Таблица";
  }
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
