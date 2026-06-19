const fs = require("fs");
const path = require("path");
const { loadState, saveState } = require("./db");

function readInitialState() {
  const p = path.join(__dirname, "..", "js", "initial-data.js");
  const raw = fs.readFileSync(p, "utf8");
  const m = raw.match(/window\.ITMEN_INITIAL\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) throw new Error("Cannot parse initial-data.js");
  return JSON.parse(m[1]);
}

function seed() {
  if (loadState()) {
    console.log("DB already has data — skip seed");
    return;
  }
  const state = readInitialState();
  saveState(state, "seed");
  console.log("Seeded", state.deals?.length || 0, "deals");
}

seed();
