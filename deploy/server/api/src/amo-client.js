"use strict";

const fs = require("fs");
const https = require("https");

const SUBDOMAIN = process.env.AMO_SUBDOMAIN || "inferit";
const BASE = `https://${SUBDOMAIN}.amocrm.ru`;
const TOKEN_FILE = process.env.AMO_TOKEN_FILE
  || ["/opt/itmen-pipeline/amo-tokens.json", "/opt/itmen-pipeline/deploy/scripts/amo-tokens.json"]
    .find(p => fs.existsSync(p))
  || "/opt/itmen-pipeline/amo-tokens.json";
const CLIENT_ID = process.env.AMO_CLIENT_ID || "f4ae4a8e-f973-406a-906a-fc3e29d4a2d9";
const CLIENT_SECRET = process.env.AMO_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.AMO_REDIRECT_URI || "https://itmen-pipeline.nwlvl.ru/";

function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.headers || {}),
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
    }, res => {
      let raw = "";
      res.on("data", c => { raw += c; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Amo HTTP ${res.statusCode}: ${raw.slice(0, 400)}`));
        }
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function saveTokens(data) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), "utf8");
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_FILE)) throw new Error(`Amo token file not found: ${TOKEN_FILE}`);
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

async function getAccessToken() {
  const stored = loadTokens();
  if (stored.refresh_token && CLIENT_SECRET) {
    try {
      const data = await httpJson(`${BASE}/oauth2/access_token`, {
        method: "POST",
        body: {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: stored.refresh_token,
          redirect_uri: REDIRECT_URI,
        },
      });
      data.saved_at = new Date().toISOString();
      saveTokens({ ...stored, ...data });
      return data.access_token;
    } catch (_) { /* fall through */ }
  }
  if (!stored.access_token) throw new Error("Amo access_token missing");
  return stored.access_token;
}

async function amoGet(path, token, query = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const suffix = qs.toString() ? `?${qs}` : "";
  return httpJson(`${BASE}${path}${suffix}`, { token });
}

async function amoGetAll(path, token, query = {}) {
  const items = [];
  let page = 1;
  while (true) {
    const data = await amoGet(path, token, { ...query, page, limit: 250 });
    const chunk = data?._embedded?.leads
      || data?._embedded?.notes
      || data?._embedded?.tasks
      || data?._embedded?.events
      || data?._embedded?.pipelines
      || [];
    items.push(...chunk);
    if (!data?._links?.next?.href) break;
    page += 1;
    if (page > 200) break;
  }
  return items;
}

module.exports = {
  BASE,
  getAccessToken,
  amoGet,
  amoGetAll,
};
