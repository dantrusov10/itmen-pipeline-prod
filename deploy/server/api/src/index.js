"use strict";

const express = require("express");
const multer = require("multer");
const { mergePipelineStates } = require("./merge");
const { loadPipelineState, savePipelineState, saveSingleDeal, deleteDealByDealId } = require("./mapper");
const { writeDealAudit } = require("./audit");
const { ensureAuth, listAll } = require("./pb-client");
const PB_URL = process.env.PB_URL || "http://127.0.0.1:8095";
const {
  loginUser,
  requireAuth,
  requireAdmin,
  canEditDeal,
  canDeleteDeal,
} = require("./auth");
const { getDynamics } = require("./dynamics");
const { takeDailySnapshot } = require("./snapshot");
const {
  getDealCrmBundle, listActivities, addActivity, listTasks, listAllTasks,
  saveTask, deleteTask, listFiles, uploadDealFile, deleteDealFile,
  saveContacts, saveDealInfo,
} = require("./deal-crm");
const {
  getOrCreateProfile, updateProfile, uploadAvatar, changePassword,
  listUsers, createUser, updateUser, deleteUser,
} = require("./users");
const {
  listNotifications, markRead, markAllRead, createNotification,
} = require("./notifications");
const { listViews, saveView, deleteView } = require("./views");
const { listPresets, savePreset, deletePreset, runReport, ENTITY_FIELDS } = require("./reports");
const { globalSearch, findDuplicates } = require("./search");
const { archiveDeal, unarchiveDeal, transferDeal, bulkDeals } = require("./deal-ops");
const { listScoringCriteria, saveScoringCriteria } = require("./scoring");
const { getKanbanConfig, saveKanbanConfig } = require("./kanban-config");

const app = express();
const PORT = Number(process.env.API_PORT || 3010);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    const user = req.user?.email || "-";
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms user=${user}`);
  });
  next();
});

function dealAccess(req, deal) {
  if (!deal) return false;
  if (deal.archived && req.user.role !== "admin") return req.query.includeArchived === "1";
  return true;
}

app.get("/api/health", async (_req, res) => {
  try {
    await ensureAuth();
    res.json({ ok: true, service: "itmen-pipeline-api", schema: 4, ts: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Укажите email и пароль" });
    const session = await loginUser(email, password);
    const profile = await getOrCreateProfile(session.user);
    res.json({ ok: true, ...session, profile });
  } catch (e) {
    res.status(401).json({ error: "Неверный email или пароль" });
  }
});

app.get("/api/auth/me", requireAuth(), async (req, res) => {
  const profile = await getOrCreateProfile(req.user);
  res.json({ user: req.user, profile });
});

app.get("/api/pipeline", requireAuth(), async (req, res) => {
  try {
    const lite = req.query.lite === "1" || req.query.lite === "true";
    const includeArchived = req.query.includeArchived === "1";
    const state = await loadPipelineState({ lite, includeArchived });
    if (!state) return res.status(404).json({ error: "Пайплайн не найден" });
    res.json({ state });
  } catch (e) {
    console.error("GET /api/pipeline", e);
    res.status(500).json({ error: e.message || "Ошибка загрузки" });
  }
});

app.get("/api/pipeline/deals/:dealId", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    res.json({ deal, canEdit: canEditDeal(req.user, deal) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка загрузки сделки" });
  }
});

app.patch("/api/deals/:dealId", requireAuth(), async (req, res) => {
  try {
    const deal = req.body?.deal;
    if (!deal || deal.id !== req.params.dealId) {
      return res.status(400).json({ error: "Некорректное тело: ожидается deal с совпадающим id" });
    }
    const existing = await loadPipelineState({ dealId: deal.id, includeArchived: true });
    const isNew = !existing;
    if (!isNew && !canEditDeal(req.user, existing)) {
      return res.status(403).json({ error: "Можно редактировать только свои сделки" });
    }
    if (!isNew && req.user.role !== "admin" && deal.owner !== existing.owner) {
      return res.status(403).json({ error: "Нельзя менять владельца сделки" });
    }
    const owner = String(deal.owner || "").trim();
    if (!owner) deal.owner = req.user.managerName || req.user.displayName || "";
    const managerRows = await listAll("managers", { sort: "name" });
    const validOwners = new Set(managerRows.map(m => m.name).filter(Boolean));
    const ownerListRows = await listAll("list_items", { filter: 'list_key="owners"' });
    ownerListRows.forEach(row => { if (row.value) validOwners.add(row.value); });
    if (!validOwners.has(deal.owner)) {
      return res.status(400).json({ error: `Недопустимый владелец: ${deal.owner}` });
    }
    const savedBy = req.user.displayName || req.user.email;
    const { saved, oldDeal, isNew: wasNew, nextId } = await saveSingleDeal(deal, { savedBy, isNew });
    const auditRows = await writeDealAudit({ savedBy, oldDeal: oldDeal || existing, newDeal: saved, isNew: wasNew });
    if (!wasNew && existing?.owner !== saved.owner) {
      await addActivity(deal.id, {
        type: "owner_changed",
        body: `Владелец: ${existing.owner} → ${saved.owner}`,
        author: savedBy,
        meta: { from: existing.owner, to: saved.owner },
      });
      const managers = await listAll("pipeline_users");
      const target = managers.find(m => m.manager_name === saved.owner);
      if (target) {
        await createNotification({
          userId: target.id,
          title: "Сделка передана вам",
          message: `${saved.customer} (${deal.id})`,
          link: "#deals",
          type: "deal_assigned",
        });
      }
    }
    if (!wasNew && existing?.stage !== saved.stage) {
      await addActivity(deal.id, { type: "stage_change", body: `Стадия: ${existing.stage} → ${saved.stage}`, author: savedBy });
    }
    if (saved.stage === "Отказ" && saved.lossReason && saved.lossReason !== existing?.lossReason) {
      await addActivity(deal.id, { type: "loss_reason", body: `Причина отказа: ${saved.lossReason}`, author: savedBy });
    }
    res.json({ ok: true, deal: saved, auditRows, nextId, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("PATCH /api/deals", e);
    res.status(500).json({ error: e.message || "Ошибка сохранения сделки" });
  }
});

app.delete("/api/deals/:dealId", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canDeleteDeal(req.user, deal)) {
      return res.status(403).json({ error: "Можно удалять только свои сделки" });
    }
    const savedBy = req.user.displayName || req.user.email;
    if (req.query.hard === "1" && req.user.role === "admin") {
      await deleteDealByDealId(req.params.dealId);
      return res.json({ ok: true, hard: true });
    }
    await archiveDeal(req.params.dealId, { savedBy });
    res.json({ ok: true, archived: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка удаления" });
  }
});

app.post("/api/deals/:dealId/unarchive", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const savedBy = req.user.displayName || req.user.email;
    await unarchiveDeal(req.params.dealId, { savedBy });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/deals/:dealId/transfer", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canEditDeal(req.user, deal) && req.user.role !== "admin") {
      return res.status(403).json({ error: "Нет прав" });
    }
    const result = await transferDeal(req.params.dealId, req.body?.owner, {
      savedBy: req.user.displayName || req.user.email,
      user: req.user,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/:dealId/crm", requireAuth(), async (req, res) => {
  try {
    const bundle = await getDealCrmBundle(req.params.dealId);
    res.json(bundle);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/:dealId/activities", requireAuth(), async (req, res) => {
  res.json({ items: await listActivities(req.params.dealId) });
});

app.post("/api/deals/:dealId/activities", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Только просмотр" });
    const savedBy = req.user.displayName || req.user.email;
    const item = await addActivity(req.params.dealId, {
      type: "comment",
      body: req.body?.body || "",
      author: savedBy,
      authorEmail: req.user.email,
    });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/:dealId/tasks", requireAuth(), async (req, res) => {
  res.json({ items: await listTasks(req.params.dealId) });
});

app.post("/api/deals/:dealId/tasks", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    const item = await saveTask(req.params.dealId, req.body?.task || {}, {
      savedBy: req.user.displayName || req.user.email,
    });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/deals/:dealId/tasks/:taskId", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    await deleteTask(req.params.dealId, req.params.taskId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/:dealId/files", requireAuth(), async (req, res) => {
  res.json({ items: await listFiles(req.params.dealId) });
});

app.post("/api/deals/:dealId/files", requireAuth(), upload.single("file"), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    if (!req.file) return res.status(400).json({ error: "Файл не передан" });
    const item = await uploadDealFile(req.params.dealId, req.file, {
      label: req.body?.label || "Файл",
      uploadedBy: req.user.displayName || req.user.email,
    });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/deals/:dealId/files/:fileId", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    await deleteDealFile(req.params.dealId, req.params.fileId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/:dealId/files/:fileId/download", requireAuth(), async (req, res) => {
  try {
    const rows = await listFiles(req.params.dealId);
    const file = rows.find(f => f.id === req.params.fileId);
    if (!file?.fileName) return res.status(404).send("Not found");
    const pbRow = await listAll("deal_files", { filter: `id="${req.params.fileId}"`, perPage: 1 });
    const rec = pbRow[0];
    if (!rec) return res.status(404).send("Not found");
    const token = await ensureAuth();
    const url = `${PB_URL}/api/files/${rec.collectionId}/${rec.id}/${file.fileName}`;
    const upstream = await fetch(url, { headers: { Authorization: token } });
    if (!upstream.ok) return res.status(upstream.status).send("Download failed");
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName || file.fileName)}"`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.put("/api/deals/:dealId/contacts", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    const items = await saveContacts(req.params.dealId, req.body?.contacts || []);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/deals/:dealId/info", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    const info = await saveDealInfo(req.params.dealId, req.body?.info || {});
    res.json({ ok: true, info });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/calendar/tasks", requireAuth(), async (req, res) => {
  try {
    let assignee = "";
    if (req.user.role === "admin") {
      if (req.query.mine === "1") assignee = req.user.managerName;
      else if (req.query.assignee) assignee = String(req.query.assignee);
    } else {
      assignee = req.user.managerName;
    }
    const items = await listAllTasks({ assignee, from: req.query.from, to: req.query.to });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/kanban/config", requireAuth(), async (_req, res) => {
  try {
    res.json(await getKanbanConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/kanban/config", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const data = await saveKanbanConfig(req.body?.stages || []);
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/scoring", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    res.json({ items: await listScoringCriteria() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/admin/scoring", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const items = await saveScoringCriteria(req.body?.items || []);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/profile/avatars", requireAuth(), async (_req, res) => {
  try {
    const { listAvatarsByManager } = require("./users");
    res.json({ map: await listAvatarsByManager() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/search", requireAuth(), async (req, res) => {
  try {
    const data = await globalSearch(req.query.q);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/duplicates", requireAuth(), async (req, res) => {
  try {
    const items = await findDuplicates({
      customer: req.query.customer,
      excludeDealId: req.query.exclude,
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/views", requireAuth(), async (req, res) => {
  res.json({ items: await listViews(req.user.id, req.query.page) });
});

app.post("/api/views", requireAuth(), async (req, res) => {
  try {
    const item = await saveView(req.user.id, req.body?.view || {});
    res.json({ ok: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/views/:id", requireAuth(), async (req, res) => {
  await deleteView(req.user.id, req.params.id);
  res.json({ ok: true });
});

app.get("/api/notifications", requireAuth(), async (req, res) => {
  res.json({ items: await listNotifications(req.user.id, { unreadOnly: req.query.unread === "1" }) });
});

app.post("/api/notifications/read", requireAuth(), async (req, res) => {
  if (req.body?.all) await markAllRead(req.user.id);
  else await markRead(req.user.id, req.body?.ids || []);
  res.json({ ok: true });
});

app.get("/api/profile", requireAuth(), async (req, res) => {
  res.json({ profile: await getOrCreateProfile(req.user) });
});

app.patch("/api/profile", requireAuth(), async (req, res) => {
  try {
    const profile = await updateProfile(req.user.id, req.body || {});
    res.json({ ok: true, profile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/profile/avatar", requireAuth(), upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Нет файла" });
    const profile = await uploadAvatar(req.user.id, req.file);
    res.json({ ok: true, profile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/profile/avatar/:userId", requireAuth(), async (req, res) => {
  try {
    const { findOne } = require("./pb-client");
    const row = await findOne("user_profiles", `user_id="${req.params.userId}"`);
    if (!row?.avatar) return res.status(404).end();
    const token = await ensureAuth();
    const url = `${PB_URL}/api/files/${row.collectionId}/${row.id}/${row.avatar}`;
    const upstream = await fetch(url, { headers: { Authorization: token } });
    if (!upstream.ok) return res.status(404).end();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (_) {
    res.status(404).end();
  }
});

app.post("/api/profile/password", requireAuth(), async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    await changePassword(token, req.body?.oldPassword, req.body?.newPassword);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/users", requireAuth(), requireAdmin, async (_req, res) => {
  res.json({ items: await listUsers() });
});

app.post("/api/admin/users", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const item = await createUser(req.body || {});
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch("/api/admin/users/:id", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const item = await updateUser(req.params.id, req.body || {});
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/admin/users/:id", requireAuth(), requireAdmin, async (req, res) => {
  await deleteUser(req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/deals/bulk", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const result = await bulkDeals(req.body || {}, {
      savedBy: req.user.displayName || req.user.email,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/reports/entities", requireAuth(), (_req, res) => {
  res.json({ entities: ENTITY_FIELDS });
});

app.get("/api/reports/presets", requireAuth(), async (req, res) => {
  res.json({ items: await listPresets(req.user.id) });
});

app.post("/api/reports/presets", requireAuth(), async (req, res) => {
  try {
    const item = await savePreset(req.user.id, req.body?.preset || {});
    res.json({ ok: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/reports/presets/:id", requireAuth(), async (req, res) => {
  await deletePreset(req.user.id, req.params.id);
  res.json({ ok: true });
});

app.post("/api/reports/run", requireAuth(), async (req, res) => {
  try {
    const data = await runReport(req.body || {});
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/pipeline", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const clientState = body.state;
    if (!clientState || !Array.isArray(clientState.deals)) {
      return res.status(400).json({ error: "Некорректное тело запроса" });
    }
    const editedDealIds = body.editedDealIds || [];
    const deletedDealIds = body.deletedDealIds || [];
    const forceFull = Boolean(body.forceFull);
    const baseDataEpoch = body.baseDataEpoch ?? clientState._dataEpoch ?? null;
    const serverState = await loadPipelineState({ lite: false });
    const serverCount = (serverState?.deals || []).length;
    const clientCount = clientState.deals.length;
    const serverEpoch = serverState?._dataEpoch || 1;
    if (forceFull) {
      if (serverCount >= 10 && clientCount < Math.max(5, Math.floor(serverCount * 0.5))) {
        return res.status(409).json({
          error: `Отклонено: в сохранении слишком мало сделок (${clientCount} из ${serverCount}). Загрузите актуальные данные.`,
        });
      }
      if (baseDataEpoch != null && serverEpoch > baseDataEpoch) {
        return res.status(409).json({
          error: `Данные на сервере новее (epoch ${serverEpoch} > ${baseDataEpoch}). Загрузите с сервера.`,
        });
      }
    }
    let mergedState, conflicts = [], keptServer = 0, tookClient = 0;
    if (forceFull) {
      mergedState = clientState;
    } else {
      const mergeResult = mergePipelineStates(serverState, clientState, editedDealIds, deletedDealIds);
      mergedState = mergeResult.state;
      conflicts = mergeResult.conflicts;
      keptServer = mergeResult.keptServer;
      tookClient = mergeResult.tookClient;
    }
    mergedState._savedBy = req.user.displayName || req.user.email;
    const savedState = await savePipelineState(mergedState, { deletedDealIds });
    res.json({
      ok: true, updatedAt: savedState._savedAt, dataEpoch: savedState._dataEpoch,
      auditRows: editedDealIds.length + deletedDealIds.length, state: savedState,
      conflicts, mergeKeptServer: keptServer, mergeTookClient: tookClient,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка сохранения" });
  }
});

app.get("/api/managers", requireAuth(), async (_req, res) => {
  const rows = await listAll("managers", { sort: "name" });
  res.json(rows.map(m => ({ id: m.manager_id, name: m.name, sheet: m.sheet })));
});

app.get("/api/dynamics", requireAuth(), async (req, res) => {
  try {
    res.json(await getDynamics(String(req.query.period || "week")));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/snapshot", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    res.json(await takeDailySnapshot("manual"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`ITMen Pipeline API v4 → http://127.0.0.1:${PORT}`);
});
