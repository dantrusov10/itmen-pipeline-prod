/* КП-калькулятор: iframe + postMessage с /kp/Index.html */
let kpBridgeDealId = null;
let kpIframeEl = null;

function computeKpStats(activities) {
  const kp = (activities || []).filter(a => a.type === "kp_issued");
  if (!kp.length) return null;
  const sorted = [...kp].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const last = sorted[0];
  return {
    count: kp.length,
    lastAmount: last?.meta?.amountWithVat ?? null,
    lastDocType: last?.meta?.docType || "",
  };
}

function renderKpHeaderBadge(dealId) {
  const stats = computeKpStats(dealCrmCache?.[dealId]?.activities);
  if (!stats) return "";
  const amt = typeof formatMoney === "function"
    ? formatMoney(stats.lastAmount || 0)
    : String(stats.lastAmount || 0);
  const times = stats.count === 1 ? "1 раз" : `${stats.count} раз`;
  return `<span class="deal-page-kp-stat muted">КП: ${times} · последнее ${escapeHtml(amt)}</span>`;
}

function renderKpCalculatorPanel(dealId) {
  const q = new URLSearchParams({ embed: "1", dealId: dealId || "" });
  return `<div class="kp-calc-wrap">
    <iframe id="kp-calc-iframe" class="kp-calc-frame" src="/kp/Index.html?${q}" title="Калькулятор КП"></iframe>
  </div>`;
}

async function sendKpPrefillToIframe() {
  if (!kpBridgeDealId || !kpIframeEl?.contentWindow) return;
  try {
    const data = await apiLoadKpPrefill(kpBridgeDealId);
    const token = window.ITMEN_AUTH?.token || "";
    if (token) {
      kpIframeEl.contentWindow.postMessage({ type: "kp-auth", token }, location.origin);
    }
    kpIframeEl.contentWindow.postMessage(
      { type: "kp-prefill", payload: { ...(data.prefill || {}), authToken: token } },
      location.origin,
    );
  } catch (e) {
    console.warn("kp prefill:", e);
  }
}

const KP_EXPORT_LABELS = { kp: "КП", tkp: "ТКП", excel: "КП (Excel)" };

async function refreshAfterKpExport(dealId, payload) {
  delete dealCrmCache[dealId];
  dealCrmCache[dealId] = await apiLoadDealCrm(dealId);
  if (typeof updateDealPageKpHeader === "function") updateDealPageKpHeader(dealId);
  const label = KP_EXPORT_LABELS[payload?.docType] || "КП";
  const amt = typeof formatMoney === "function"
    ? formatMoney(payload?.amountWithVat || 0)
    : String(payload?.amountWithVat || 0);
  if (typeof showToast === "function") {
    showToast(`${label} сохранён в файлы сделки · ${amt} с НДС`);
  }
  if (typeof window.getDealPageRightTab === "function" && window.getDealPageRightTab() === "events"
    && typeof refreshDealPageRightPanel === "function") {
    await refreshDealPageRightPanel();
  }
  if (typeof window.getDealPageLeftTab === "function" && window.getDealPageLeftTab() === "files"
    && typeof switchDealPageLeftTab === "function") {
    await switchDealPageLeftTab("files");
  }
}

function onKpBridgeMessage(ev) {
  if (ev.origin !== location.origin) return;
  const msg = ev.data;
  if (!msg?.type) return;
  if (msg.type === "kp-ready") {
    if (msg.dealId) kpBridgeDealId = msg.dealId;
    if (kpIframeEl && ev.source === kpIframeEl.contentWindow) sendKpPrefillToIframe();
    return;
  }
  if (msg.type === "kp-export-done") {
    const dealId = msg.payload?.dealId || kpBridgeDealId;
    if (!dealId) return;
    refreshAfterKpExport(dealId, msg.payload || {}).catch(e => {
      console.error("kp export refresh:", e);
      if (typeof showToast === "function") showToast("КП загружен, но не удалось обновить ленту");
    });
    return;
  }
  if (msg.type === "kp-export-error") {
    const msgText = msg.payload?.message || "Ошибка загрузки КП";
    if (typeof showToast === "function") showToast(msgText);
    else console.error(msgText);
  }
}

function bindKpCalculatorBridge(dealId) {
  kpBridgeDealId = dealId;
  kpIframeEl = document.getElementById("kp-calc-iframe");
  if (!window.__kpBridgeListener) {
    window.__kpBridgeListener = true;
    window.addEventListener("message", onKpBridgeMessage);
  }
}

window.renderKpHeaderBadge = renderKpHeaderBadge;
window.renderKpCalculatorPanel = renderKpCalculatorPanel;
window.bindKpCalculatorBridge = bindKpCalculatorBridge;
window.computeKpStats = computeKpStats;
