import fs from "fs";
import vm from "vm";
import { JSDOM } from "jsdom";

const root = `${process.env.USERPROFILE}/Downloads/ITMen_Q3_HTML`.replace(/\\/g, "/");
const state = JSON.parse(fs.readFileSync(`${root}/tools/_test_state.json`, "utf8"));
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<section id="page-panel"></section>
<div id="dash-filter-pop" hidden></div>
<div id="dash-filter-inner"></div>
</body></html>`);
const { window } = dom;

const ctx = {
  window,
  document: window.document,
  localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  location: { hash: "#sales/panel", origin: "http://x", pathname: "/", href: "http://x/#sales/panel" },
  history: { replaceState() {} },
  console,
  setTimeout,
  clearTimeout,
  fetch: async () => ({ ok: false, json: async () => ({}), text: async () => "" }),
  navigator: { clipboard: { writeText: async () => {} } },
  structuredClone: (v) => JSON.parse(JSON.stringify(v)),
  alert: (m) => console.error("ALERT", m),
  prompt: () => null,
  ExcelJS: {},
};

vm.createContext(ctx);
ctx.window.ITMEN_API = { backend: "pocketbase", enabled: true };
ctx.window.ITMEN_INITIAL = { deals: [], lists: {}, scoring: [] };

const scripts = [
  "js/bootstrap.js",
  "js/config.js",
  "js/passport-completeness.js",
  "js/calc.js",
  "js/gas-config.js",
  "js/workspaces.js",
  "js/report-filters.js",
  "js/deals-table.js",
  "js/amo-filters.js",
  "js/dynamics.js",
  "js/dashboard-widgets.js",
  "js/app.js",
];

for (const f of scripts) {
  try {
    vm.runInContext(fs.readFileSync(`${root}/${f}`, "utf8"), ctx);
  } catch (e) {
    console.error(`LOAD FAIL ${f}:`, e.message);
    process.exit(1);
  }
}

ctx.state = state;
ctx.passportBlockSelection = ctx.passportBlockSelection || ["basic"];

try {
  const m = ctx.getDashboardMetrics();
  ctx.renderPanel(m);
  const html = window.document.getElementById("page-panel").innerHTML;
  console.log("renderPanel OK, length", html.length, "metrics", m.pipelineCount);
  if (html.includes("metric-card")) console.log("has metric cards");
  else console.log("NO metric cards:", html.slice(0, 500));
} catch (e) {
  console.error("renderPanel FAIL", e.stack);
  process.exit(1);
}
