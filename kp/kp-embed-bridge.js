(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const EMBED = params.get("embed") === "1";
  const DEAL_ID = params.get("dealId") || "";
  const ORIGIN = location.origin;
  const AUTH_KEY = "itmen_pipeline_auth_v1";
  let CRM_TOKEN = "";

  if (EMBED) {
    const st = document.createElement("style");
    st.textContent = [
      "html.kp-embed body { margin: 0; }",
      "html.kp-embed .container { max-width: none; margin: 0; padding: 8px 12px 24px; }",
      "html.kp-embed .ui-topright-logo { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }",
    ].join("\n");
    document.head.appendChild(st);
    document.documentElement.classList.add("kp-embed");
  }

  function readStoredToken() {
    try {
      const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
      if (!raw) return "";
      return JSON.parse(raw).token || "";
    } catch (_) {
      return "";
    }
  }

  function getAuthToken() {
    return CRM_TOKEN || readStoredToken();
  }

  function applyPrefill(data) {
    if (!data || typeof data !== "object") return;
    if (data.authToken) CRM_TOKEN = data.authToken;
    const fields = {
      clientName: "clientName",
      endpoints: "endpoints",
      managerName: "managerName",
      managerEmail: "managerEmail",
      managerPhone: "managerPhone",
      partnerName: "partnerName",
      partnerDiscount: "partnerDiscount",
    };
    Object.keys(fields).forEach(k => {
      if (data[k] == null || data[k] === "") return;
      const el = document.getElementById(fields[k]);
      if (el) el.value = String(data[k]);
    });
    const disc = parseFloat(data.partnerDiscount);
    if (!Number.isNaN(disc) && disc > 0) {
      const use = document.getElementById("usePartnerDiscount");
      if (use) use.checked = true;
    }
    try { if (typeof recalc === "function") recalc(); } catch (_) { /* */ }
  }

  function totalsWithVat() {
    try {
      if (typeof buildItems !== "function" || typeof computeTotals !== "function") return 0;
      return computeTotals(buildItems()).sumWithVAT || 0;
    } catch (_) {
      return 0;
    }
  }

  function docTypeFromName(name) {
    const n = String(name || "").toLowerCase();
    if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "excel";
    if (n.includes("tkp")) return "tkp";
    return "kp";
  }

  function notifyExportError(message) {
    parent.postMessage({
      type: "kp-export-error",
      payload: { dealId: DEAL_ID, message: message || "Ошибка загрузки" },
    }, ORIGIN);
  }

  async function uploadExport(blob, fileName) {
    if (!EMBED || !blob || !DEAL_ID) return;
    const token = getAuthToken();
    if (!token) {
      notifyExportError("Нет авторизации");
      return;
    }
    const docType = docTypeFromName(fileName);
    const fd = new FormData();
    fd.append("file", blob, fileName || "export");
    fd.append("docType", docType);
    fd.append("amountWithVat", String(totalsWithVat()));
    fd.append("fileName", fileName || "export");
    const res = await fetch(`/api/deals/${encodeURIComponent(DEAL_ID)}/kp/export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || "Ошибка загрузки");
    parent.postMessage({
      type: "kp-export-done",
      payload: {
        dealId: DEAL_ID,
        docType,
        fileName: fileName || "export",
        amountWithVat: totalsWithVat(),
      },
    }, ORIGIN);
  }

  function pdfToBlob(pdf) {
    if (!pdf || typeof pdf.output !== "function") return null;
    try {
      const b = pdf.output("blob");
      if (b instanceof Blob && b.size > 0) return b;
    } catch (_) { /* */ }
    try {
      const ab = pdf.output("arraybuffer");
      if (ab && ab.byteLength) return new Blob([ab], { type: "application/pdf" });
    } catch (_) { /* */ }
    try {
      const uri = pdf.output("datauristring");
      if (uri && uri.startsWith("data:")) {
        const comma = uri.indexOf(",");
        const b64 = uri.slice(comma + 1);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: "application/pdf" });
      }
    } catch (_) { /* */ }
    return null;
  }

  function queueUpload(blob, fileName) {
    uploadExport(blob, fileName).catch(err => {
      notifyExportError(err.message || String(err));
    });
  }

  window.kpUploadPdf = function (pdf, fileName) {
    if (!EMBED) return;
    const blob = pdfToBlob(pdf);
    if (!blob) {
      notifyExportError("Не удалось получить PDF для загрузки в CRM");
      return;
    }
    queueUpload(blob, fileName || "KP_ITMen.pdf");
  };

  window.kpUploadBlob = function (blob, fileName) {
    if (!EMBED || !blob) return;
    queueUpload(blob, fileName || "export");
  };

  function patchPdfSave() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J || J.prototype.__kpBridge) return;
    J.prototype.__kpBridge = true;
  }

  function hookBlobDownloads() {
    if (HTMLAnchorElement.prototype.__kpBridgeClick) return;
    HTMLAnchorElement.prototype.__kpBridgeClick = true;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const href = String(this.href || "");
      const name = String(this.download || "").toLowerCase();
      const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
      if (EMBED && this.download && isExcel && (href.startsWith("blob:") || href.startsWith("data:"))) {
        fetch(href).then(r => r.blob()).then(blob => {
          queueUpload(blob, this.download || "export.xlsx");
        }).catch(() => { /* */ });
      }
      return origClick.apply(this, arguments);
    };
  }

  window.addEventListener("message", ev => {
    if (ev.origin !== ORIGIN) return;
    const msg = ev.data;
    if (!msg?.type) return;
    if (msg.type === "kp-prefill") {
      applyPrefill(msg.payload || {});
      return;
    }
    if (msg.type === "kp-auth" && msg.token) {
      CRM_TOKEN = msg.token;
    }
  });

  function ready() {
    CRM_TOKEN = readStoredToken();
    patchPdfSave();
    hookBlobDownloads();
    let n = 0;
    const iv = setInterval(() => {
      patchPdfSave();
      if (++n > 50) clearInterval(iv);
    }, 200);
    if (EMBED) parent.postMessage({ type: "kp-ready", dealId: DEAL_ID }, ORIGIN);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
