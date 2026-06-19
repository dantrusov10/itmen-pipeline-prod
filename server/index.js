require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require("fs");

const { loadState, saveState, logAudit } = require("./db");
const { MANAGERS, authenticate, authMiddleware } = require("./auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");

app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());

function cleanState(raw) {
  if (!raw) return raw;
  const s = { ...raw };
  delete s._savedAt;
  delete s._savedBy;
  return s;
}

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.get("/api/managers", (_req, res) => {
  res.json(MANAGERS.filter(m => m.role === "manager").map(m => ({
    id: m.id, name: m.name, sheet: m.sheet,
  })));
});

app.post("/api/auth/login", (req, res) => {
  const { login, pin } = req.body || {};
  const result = authenticate(login, pin);
  if (!result) return res.status(401).json({ error: "Неверный логин или PIN" });

  res.cookie("itmen_token", result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  logAudit("login", result.user.name, result.user.role);
  res.json(result);
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("itmen_token");
  res.json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/pipeline", authMiddleware, (req, res) => {
  let state = loadState();
  if (!state) {
    try {
      require("./seed.js");
      state = loadState();
    } catch (e) {
      console.error("Seed failed:", e.message);
    }
  }
  if (!state) return res.status(503).json({ error: "Данные не инициализированы. Запустите npm run seed" });

  if (req.user.role === "manager") {
    const full = cleanState(loadState());
    state = cleanState({
      ...full,
      deals: (full.deals || []).filter(d => d.owner === req.user.name),
      _meta: { filtered: true, owner: req.user.name, totalDeals: full.deals?.length || 0 },
    });
  } else {
    state = cleanState(state);
  }
  res.json({ state, user: req.user });
});

app.put("/api/pipeline", authMiddleware, (req, res) => {
  const incoming = req.body?.state;
  if (!incoming || !Array.isArray(incoming.deals)) {
    return res.status(400).json({ error: "Некорректное тело запроса" });
  }

  if (req.user.role === "manager") {
    const full = loadState() || { deals: [], lists: incoming.lists, nextId: incoming.nextId };
    const others = (full.deals || []).filter(d => d.owner !== req.user.name);
    const mine = incoming.deals.map(d => ({ ...d, owner: req.user.name }));
    incoming.deals = [...others, ...mine];
    incoming.nextId = Math.max(full.nextId || 1, incoming.nextId || 1);
    if (full.pipelineFocus) incoming.pipelineFocus = full.pipelineFocus;
    if (full.scoring) incoming.scoring = full.scoring;
    if (full.lists) incoming.lists = { ...full.lists, ...incoming.lists };
  }

  const updatedAt = saveState(cleanState(incoming), req.user.name);
  logAudit("save_pipeline", req.user.name, `${incoming.deals.length} deals`);
  res.json({ ok: true, updatedAt });
});

app.get("/api/export/template", authMiddleware, (_req, res) => {
  const p = path.join(ROOT, "ITMen_Pipeline_Шаблон_менеджеров.xlsx");
  if (!fs.existsSync(p)) return res.status(404).json({ error: "Шаблон не найден" });
  res.download(p, "ITMen_Pipeline_Шаблон_менеджеров.xlsx");
});

app.post("/api/import/excel", authMiddleware, upload.single("file"), (_req, res) => {
  res.status(501).json({
    error: "Импорт Excel выполняйте в браузере (⬆️ Импорт Excel) — данные сохранятся на сервер автоматически",
  });
});

app.use(express.static(ROOT, { index: "index.html" }));

app.get("/login", (_req, res) => {
  res.sendFile(path.join(ROOT, "login.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.path.includes(".")) return next();
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, () => {
  console.log(`ITMen Pipeline → http://localhost:${PORT}`);
  try { require("./seed.js"); } catch (e) { console.warn("Auto-seed:", e.message); }
});
