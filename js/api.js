/* API-клиент: PocketBase (prod) или локальный Express (dev) */
(function () {
  const onItmenHost = /itmen-pipeline\.nwlvl\.ru$/i.test(location.hostname);
  const onLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  let backend = "local";
  if (onItmenHost) backend = "pocketbase";
  else if (onLocal) backend = "express";

  window.ITMEN_API = {
    enabled: backend === "express" || backend === "pocketbase",
    backend,
    base: "",
  };
})();

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
  const lite = opts.lite !== false && window.ITMEN_API?.backend === "pocketbase";
  const all = opts.all === true;
  const page = all ? "" : String(opts.page || state?.dealsPagination?.page || 1);
  const perPage = all ? "" : String(opts.perPage || state?.dealsPagination?.perPage || 100);
  const lqKey = opts.listQuery ? JSON.stringify(opts.listQuery) : "";
  const inflightKey = `${window.ITMEN_API?.backend || ""}:${lite ? "lite" : "full"}:${all ? "all" : `${page}x${perPage}`}:${lqKey}`;
  if (pipelineInflight?.key === inflightKey) return pipelineInflight.promise;
  const promise = apiLoadPipelineInner(opts, lite, all, page, perPage);
  pipelineInflight = { key: inflightKey, promise };
  try {
    return await promise;
  } finally {
    if (pipelineInflight?.promise === promise) pipelineInflight = null;
  }
}

async function apiLoadPipelineInner(opts, lite, all, page, perPage) {
  if (window.ITMEN_API.backend === "pocketbase") {
    const params = new URLSearchParams();
    if (lite) params.set("lite", "1");
    if (opts.includeArchived) params.set("includeArchived", "1");
    if (all) params.set("all", "1");
    else {
      params.set("page", page);
      params.set("perPage", perPage);
    }
    const lq = opts.listQuery;
    if (lq) {
      if (lq.q) params.set("q", lq.q);
      if (lq.mine) params.set("mine", "1");
      if (lq.filters) params.set("filters", lq.filters);
      if (lq.sortKey) params.set("sortKey", lq.sortKey);
      if (lq.sortDir) params.set("sortDir", lq.sortDir);
      if (lq.presaleWs) params.set("presaleWs", "1");
      if (lq.adminOwners) params.set("adminOwners", lq.adminOwners);
    }
    const qs = params.toString() ? `?${params}` : "";
    const { state } = await apiFetch(`/api/pipeline${qs}`);
    return state || null;
  }
  const { state } = await apiFetch("/api/pipeline");
  return state || null;
}

async function apiLoadDeal(dealId) {
  if (window.ITMEN_API.backend === "pocketbase") {
    const { deal } = await apiFetch(`/api/pipeline/deals/${encodeURIComponent(dealId)}`);
    return deal || null;
  }
  const { state } = await apiFetch("/api/pipeline");
  return (state?.deals || []).find(d => d.id === dealId) || null;
}

async function apiSaveDeal(deal, meta = {}) {
  if (window.ITMEN_API.backend === "pocketbase") {
    const body = {
      deal,
      baseDataEpoch: deal._dataEpoch ?? state._dataEpoch ?? null,
    };
    if (meta.presalePatch) body.presalePatch = meta.presalePatch;
    const res = await apiFetch(`/api/deals/${encodeURIComponent(deal.id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
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

async function apiSavePipeline(stateObj, meta = {}) {
  if (window.ITMEN_API.backend === "pocketbase" && meta.editedDealIds?.length === 1 && !meta.forceFull) {
    const deal = (stateObj.deals || []).find(d => d.id === meta.editedDealIds[0]);
    if (deal) return apiSaveDeal(deal);
  }
  return apiFetch("/api/pipeline", {
    method: "PUT",
    body: JSON.stringify({
      state: stateObj,
      editedDealIds: meta.editedDealIds || [],
      deletedDealIds: meta.deletedDealIds || [],
      baseSavedAt: meta.baseSavedAt || stateObj._savedAt || null,
      baseDataEpoch: meta.baseDataEpoch ?? stateObj._dataEpoch ?? null,
      forceFull: !!meta.forceFull,
    }),
  });
}

async function apiListManagers() {
  return apiFetch("/api/managers");
}

function apiBackendLabel() {
  if (window.ITMEN_API.backend === "pocketbase") return "PocketBase";
  if (window.ITMEN_API.backend === "express") return "сервер";
  return "этот браузер";
}

function showSetupBanner() {
  /* legacy no-op */
}
