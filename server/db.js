const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_PATH = path.join(DATA_DIR, "pipeline.json");
const AUDIT_PATH = path.join(DATA_DIR, "audit.log.jsonl");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state, updatedBy) {
  ensureDir();
  const now = new Date().toISOString();
  const payload = { ...state, _savedAt: now, _savedBy: updatedBy || null };
  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return now;
}

function logAudit(action, userName, detail) {
  ensureDir();
  const line = JSON.stringify({
    action, user: userName, detail, at: new Date().toISOString(),
  });
  fs.appendFileSync(AUDIT_PATH, line + "\n", "utf8");
}

module.exports = { loadState, saveState, logAudit, STATE_PATH };
