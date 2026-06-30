import fs from "fs";
import vm from "vm";

const root = `${process.env.USERPROFILE}/Downloads/ITMen_Q3_HTML`.replace(/\\/g, "/");
const state = JSON.parse(fs.readFileSync(`${root}/tools/_test_state.json`, "utf8"));

const ctx = {
  window: {},
  console,
  structuredClone: (v) => JSON.parse(JSON.stringify(v)),
  document: { createElement: () => ({ dataset: {}, attributes: [] }) },
  location: { hash: "", origin: "http://x", pathname: "/" },
  history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
};
ctx.window = ctx;
vm.createContext(ctx);

for (const f of [
  "js/bootstrap.js", "js/config.js", "js/passport-completeness.js", "js/calc.js",
  "js/workspaces.js", "js/report-filters.js", "js/deals-table.js", "js/amo-filters.js", "js/dashboard-widgets.js",
]) {
  vm.runInContext(fs.readFileSync(`${root}/${f}`, "utf8"), ctx);
}

ctx.state = state;
ctx.dashboardAmoFilters = {};
ctx.dashboardMineOnly = false;

const spec = ctx.buildDealsReportSpec({ budgetStatus: ["Подтверждён"] }, { type: "confirmedBudget" });
ctx.applyDealsReportSpec(spec);

const all = state.deals.filter(d => !d.archived);
const filtered = ctx.applyDealsTableFilters(all.map(d => ctx.enrichDeal(d)));

console.log("total", all.length, "filtered", filtered.length, "activeSpec", JSON.stringify(ctx.dealsTableActiveSpec));
console.log("preset", ctx.dealsTablePreset, "colFilters", ctx.dealsTableColFilters);

const spec2 = ctx.buildDealsReportSpec({ category: ["Горячая"] });
ctx.applyDealsReportSpec(spec2);
const filtered2 = ctx.applyDealsTableFilters(all.map(d => ctx.enrichDeal(d)));
console.log("hot total", all.length, "hot filtered", filtered2.length);
