import fs from "fs";
import vm from "vm";
import { JSDOM } from "jsdom";

const root = `${process.env.USERPROFILE}/Downloads/ITMen_Q3_HTML`.replace(/\\/g, "/");
const dom = new JSDOM(`<!DOCTYPE html><body></body></html>`);
const { window } = dom;

const ctx = { window, document: window.document, console, structuredClone: (v) => JSON.parse(JSON.stringify(v)),
  localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  location: { hash: "#sales/panel", origin: "https://itmen-pipeline.nwlvl.ru", pathname: "/" },
  history: { replaceState() {} },
};
vm.createContext(ctx);

for (const f of ["js/config.js", "js/calc.js", "js/workspaces.js", "js/report-filters.js", "js/amo-filters.js", "js/dashboard-widgets.js", "js/app.js"]) {
  try { vm.runInContext(fs.readFileSync(`${root}/${f}`, "utf8"), ctx); } catch (e) { console.error("load", f, e.message); }
}

ctx.dashboardAmoFilters = {};
ctx.dashboardMineOnly = false;
ctx.dashboardScoringMode = "with_prob";

const href = ctx.drillLinkAttrs(ctx.withDashboardFilters(ctx.buildDealsReportSpec({ budgetStatus: ["Подтверждён"] }, { type: "confirmedBudget" })));
console.log("drill attrs sample:", href.slice(0, 120));

const a = window.document.createElement("a");
a.className = "metric-card metric-card--drill dash-drill-link";
a.setAttribute("href", href.match(/href="([^"]+)"/)[1]);
a.innerHTML = "test";

const hrefSpec = ctx.drillSpecFromHref(a);
const elSpec = ctx.drillSpecFromElement(a);
const pick = ctx.pickDrillFilters(a);
console.log("hrefSpec", JSON.stringify(hrefSpec));
console.log("elSpec preset", elSpec?.preset?.type, "filters", elSpec?.filters);
console.log("pick", JSON.stringify(pick));

const spec = ctx.buildDashDrillSpec(a);
console.log("buildDashDrillSpec", JSON.stringify(spec));
