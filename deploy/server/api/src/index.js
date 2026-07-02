"use strict";

const express = require("express");
const zlib = require("zlib");
const multer = require("multer");
const { mergePipelineStates } = require("./merge");
const { loadPipelineState, savePipelineState, saveSingleDeal, deleteDealByDealId } = require("./mapper");
const { diffDeal, writeDealAudit } = require("./audit");
const { ensureAuth, listAll, findOne } = require("./pb-client");
const PB_URL = process.env.PB_URL || "http://127.0.0.1:8095";
const {
  loginUser,
  requireAuth,
  requireAdmin,
  canEditDeal,
  canEditSalesDeal,
  canEditPresaleDeal,
  canDeleteDeal,
  resolveTaskAssignee,
  userHasRole,
} = require("./auth");
const {
  getPresaleForDeal,
  patchPresaleDeal,
  addPresaleEvent,
  syncPresaleFromSalesStage,
  PRESALE_STAGES,
  backfillPresaleFromDeals,
} = require("./presale-data");
const { getDynamics } = require("./dynamics");
const { listAdminActivities } = require("./activities");
const { takeDailySnapshot } = require("./snapshot");
const {
  getDealCrmBundle, listActivities, addActivity, addCommentWithFile, listTasks, listAllTasks, listNextTaskDueByDeal,
  saveTask, deleteTask, listFiles, uploadDealFile, deleteDealFile,
  saveContacts, saveDealInfo, ensureFileExtension, listContacts, getDealInfo,
  getKpPrefill, uploadKpExport,
} = require("./deal-crm");
const { linkContactsOnSave, linkCompanyOnSave, suggestEntities } = require("./entity-resolve");
const {
  getOrCreateProfile, updateProfile, uploadAvatar, changePassword, changeEmail,
  listUsers, createUser, updateUser, deleteUser, listOwnerCandidates, listAdminOwners, resolveOwnerName, normalizeOwnerKey,
} = require("./users");
const {
  listNotifications, markRead, markAllRead, createNotification,
} = require("./notifications");
const { listViews, saveView, deleteView } = require("./views");
const { listPresets, savePreset, deletePreset, runReport, ENTITY_FIELDS } = require("./reports");
const { globalSearch, findDuplicates } = require("./search");
const { archiveDeal, unarchiveDeal, transferDeal, bulkDeals } = require("./deal-ops");
const { listScoringCriteria, saveScoringCriteria } = require("./scoring");
const {
  getKanbanConfig, saveKanbanConfig, resetSalesStagesLists,
  PRESALE_CONFIG_KEY, PARTNER_CONFIG_KEY, TECH_PARTNER_CONFIG_KEY,
} = require("./kanban-config");
const { getPipelinesConfig, savePipelinesConfig } = require("./pipelines-config");
const { pollAmoInbound, loadSyncMeta } = require("./amo-sync");
const { syncLeadFromAmo, findDealRowByAmoId } = require("./amo-lead-sync");
const { getAccessToken, amoGetAll } = require("./amo-client");
const { searchPartnerRefs } = require("./partner-refs");
const {
  listPilotRequirements, listProductRequirements,
  savePilotRequirements, saveProductRequirements,
  FEASIBILITY_OPTIONS, PILOT_REQ_TYPES,
} = require("./requirements");
const { buildRequirementsSummary } = require("./requirements-summary");

const app = express();
const PORT = Number(process.env.API_PORT || 3010);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: "50mb" }));

/** Сжатие крупных JSON (пайплайн ~1.5 MB → ~200 KB gzip) */
app.use((req, res, next) => {
  const accept = String(req.headers["accept-encoding"] || "");
  if (!accept.includes("gzip")) return next();
  const origJson = res.json.bind(res);
  res.json = function gzipJson(body) {
    let text;
    try {
      text = JSON.stringify(body);
    } catch (e) {
      return origJson(body);
    }
    if (text.length < 2048) return origJson(body);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Encoding", "gzip");
    res.removeHeader("Content-Length");
    zlib.gzip(Buffer.from(text, "utf8"), (err, compressed) => {
      if (err) {
        res.removeHeader("Content-Encoding");
        return origJson(body);
      }
      res.end(compressed);
    });
  };
  next();
});

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
});

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
    res.json({
      ok: true,
      service: "itmen-pipeline-api",
      schema: 6,
      build: process.env.ITMEN_BUILD_ID || process.env.GIT_COMMIT || "local",
      ts: new Date().toISOString(),
    });
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

app.get("/api/users/owners", requireAuth(), async (_req, res) => {
  try {
    const [owners, adminOwners] = await Promise.all([listOwnerCandidates(), listAdminOwners()]);
    res.json({ ok: true, owners, adminOwners });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
    const all = req.query.all === "1" || req.query.all === "true";
    const page = all ? null : (req.query.page != null ? Number(req.query.page) : null);
    const perPage = req.query.perPage != null ? Number(req.query.perPage) : 100;
    const listQuery = {
      q: req.query.q,
      mine: req.query.mine,
      filters: req.query.filters,
      sortKey: req.query.sortKey,
      sortDir: req.query.sortDir,
      presaleWs: req.query.presaleWs,
      adminOwners: req.query.adminOwners,
      page: req.query.page,
      perPage: req.query.perPage,
    };
    const state = await loadPipelineState({
      lite,
      includeArchived,
      page,
      perPage,
      all,
      listQuery,
      user: req.user,
    });
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
    const canSales = isNew || canEditSalesDeal(req.user, existing);
    const canPresale = isNew || canEditPresaleDeal(req.user, existing);
    if (!isNew && !canSales && !canPresale) {
      return res.status(403).json({ error: "Нет прав на редактирование сделки" });
    }
    const baseDataEpoch = req.body?.baseDataEpoch ?? deal._dataEpoch ?? null;
    if (!isNew && baseDataEpoch != null) {
      const metaRow = await findOne("pipeline_meta", 'slug="main"');
      const serverEpoch = metaRow?.data_epoch || 1;
      if (serverEpoch > baseDataEpoch) {
        return res.status(409).json({
          error: `Данные на сервере новее (epoch ${serverEpoch} > ${baseDataEpoch}). Обновите страницу.`,
          serverEpoch,
          baseDataEpoch,
        });
      }
    }
    if (!isNew && deal.owner !== existing.owner) {
      if (!userHasRole(req.user, "admin") && !canSales) {
        return res.status(403).json({ error: "Нельзя менять владельца сделки" });
      }
    }
    const owner = String(deal.owner || "").trim();
    if (!owner) deal.owner = req.user.managerName || req.user.displayName || "";
    if (/^\d+$/.test(String(deal.owner || "").trim())) {
      try {
        const { resolveCrmPersonFromAmo } = require("./amo-users");
        const { getAccessToken } = require("./amo-client");
        const amoToken = await getAccessToken();
        const fromAmo = await resolveCrmPersonFromAmo(deal.owner, amoToken, { defaultIfMissing: false });
        if (fromAmo) deal.owner = fromAmo;
        else if (existing?.owner && !/^\d+$/.test(String(existing.owner))) deal.owner = existing.owner;
      } catch (_) { /* keep validation below */ }
    }
    const ownerCandidates = await listOwnerCandidates();
    const resolvedOwner = resolveOwnerName(deal.owner, ownerCandidates);
    const ownerOk = resolvedOwner && ownerCandidates.some(
      c => normalizeOwnerKey(c) === normalizeOwnerKey(resolvedOwner),
    );
    if (!ownerOk) {
      return res.status(400).json({ error: `Недопустимый владелец: ${deal.owner}` });
    }
    deal.owner = resolvedOwner;
    const savedBy = req.user.displayName || req.user.email;
    if (
      existing
      && deal.stage !== existing.stage
      && deal.stage === "Пилот Окончен"
      && !userHasRole(req.user, "admin")
      && !userHasRole(req.user, "presale")
    ) {
      return res.status(400).json({
        error: "Стадию «Пилот Окончен» может установить только пре-сейл (успех или отказ пилота)",
      });
    }
    const { saved, oldDeal, isNew: wasNew, nextId } = await saveSingleDeal(deal, { savedBy, isNew, skipAudit: true });
    if (req.body?.presalePatch && deal.id) {
      const { savePresaleForDeal, syncPresaleFieldsToDealRow } = require("./presale-data");
      const presaleRes = await savePresaleForDeal(deal.id, req.body.presalePatch, saved);
      await syncPresaleFieldsToDealRow(deal.id, {
        stage: presaleRes?.stage,
        owner: presaleRes?.owner,
      });
      saved.presale = presaleRes;
    }
    if (!wasNew && existing?.stage !== saved.stage) {
      try {
        if (saved.stage === "Отказ") {
          const { syncPresaleFromSalesReject } = require("./sales-loss-sync");
          await syncPresaleFromSalesReject(deal.id, saved, { savedBy, fromStage: existing.stage });
        } else {
          await syncPresaleFromSalesStage(deal.id, existing.stage, saved.stage, { savedBy });
        }
      } catch (e) {
        console.warn("syncPresaleFromSalesStage", e.message);
      }
    } else if (!wasNew && existing?.stage === "Отказ" && saved.stage === "Отказ"
      && saved.lossReason && saved.lossReason !== existing?.lossReason) {
      try {
        const { syncPresaleFromSalesReject } = require("./sales-loss-sync");
        await syncPresaleFromSalesReject(deal.id, saved, { savedBy, fromStage: existing.stage });
      } catch (e) {
        console.warn("syncPresaleFromSalesReject", e.message);
      }
    } else if (wasNew) {
      try {
        const { getPresaleForDeal } = require("./presale-data");
        const { ensureKaitenCardForDeal, dealInPresaleFunnel } = require("./kaiten-sync");
        const presale = await getPresaleForDeal(saved.id, saved);
        if (dealInPresaleFunnel(saved, presale)) {
          await ensureKaitenCardForDeal(saved.id, saved, presale, { savedBy });
        }
      } catch (e) {
        console.warn("kaiten new deal", e.message);
      }
    }
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
      await addActivity(deal.id, { type: "stage_change", body: `${existing.stage} → ${saved.stage}`, author: savedBy });
    }
    if (saved.stage === "Отказ" && saved.lossReason && saved.lossReason !== existing?.lossReason) {
      await addActivity(deal.id, { type: "loss_reason", body: `Причина отказа: ${saved.lossReason}`, author: savedBy });
    }
    if (!wasNew && existing) {
      const skip = new Set(["stage", "owner", "lossReason", "updatedAt", "lastUpdate", "dealType", "amoId", "archived"]);
      for (const ch of diffDeal(existing, saved)) {
        if (skip.has(ch.field)) continue;
        const oldV = ch.old || "—";
        const newV = ch.new || "—";
        if (oldV === newV) continue;
        await addActivity(deal.id, {
          type: "field_change",
          body: `${ch.label}: ${oldV} → ${newV}`,
          author: savedBy,
        });
      }
    }
    const metaAfter = await findOne("pipeline_meta", 'slug="main"');
    res.json({
      ok: true,
      deal: saved,
      auditRows,
      nextId,
      updatedAt: new Date().toISOString(),
      dataEpoch: metaAfter?.data_epoch || null,
    });
  } catch (e) {
    console.error("PATCH /api/deals", e);
    res.status(e.status || 500).json({
      error: e.message || "Ошибка сохранения сделки",
      alerts: e.alerts || undefined,
    });
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

app.post("/api/deals/:dealId/activities", requireAuth(), upload.single("file"), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Только просмотр" });
    const savedBy = req.user.displayName || req.user.managerName || req.user.email;
    const body = String(req.body?.body ?? req.body?.text ?? "").trim();
    const item = req.file
      ? await addCommentWithFile(req.params.dealId, {
        body,
        author: savedBy,
        authorEmail: req.user.email,
        file: req.file,
        label: req.body?.label || "Файл",
        uploadedBy: savedBy,
      })
      : await addActivity(req.params.dealId, {
        type: String(req.body?.type || "comment").trim() || "comment",
        body,
        author: savedBy,
        authorEmail: req.user.email,
        meta: (() => {
          const m = req.body?.meta;
          if (!m) return {};
          if (typeof m === "string") {
            try { return JSON.parse(m); } catch { return {}; }
          }
          return m;
        })(),
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
    const task = { ...(req.body?.task || {}) };
    task.assignee = resolveTaskAssignee(req.user, task.assignee);
    const item = await saveTask(req.params.dealId, task, {
      savedBy: req.user.displayName || req.user.email,
    });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
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
    res.setHeader("Content-Type", upstream.headers.get("content-type") || file.mimeType || "application/octet-stream");
    const dlName = ensureFileExtension(file.originalName || file.fileName, file.mimeType || upstream.headers.get("content-type") || "");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(dlName)}`);
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
    const savedBy = req.user.displayName || req.user.email;
    const oldContacts = await listContacts(req.params.dealId);
    const items = await saveContacts(req.params.dealId, req.body?.contacts || []);
    await linkContactsOnSave(items).catch(() => {});
    const fmt = cs => (cs || []).map(c => [c.name, c.email, c.phone].filter(Boolean).join(" · ")).filter(Boolean).join("; ") || "—";
    const oldText = fmt(oldContacts);
    const newText = fmt(items);
    if (oldText !== newText) {
      await addActivity(req.params.dealId, { type: "contacts_change", body: `${oldText} → ${newText}`, author: savedBy });
    }
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/deals/:dealId/info", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    const savedBy = req.user.displayName || req.user.email;
    const oldInfo = await getDealInfo(req.params.dealId);
    const info = await saveDealInfo(req.params.dealId, req.body?.info || {});
    await linkCompanyOnSave(info).catch(() => {});
    const INFO_LABELS = {
      companyName: "Название ЮЛ", companyInn: "ИНН", website: "Сайт", productItmen: "Продукт ИТМен",
      endpoints: "Конечные точки", procurementFormat: "Формат закупки", distributor: "Дистрибьютор",
    };
    for (const [key, label] of Object.entries(INFO_LABELS)) {
      const o = String(oldInfo?.[key] || "").trim();
      const n = String(info?.[key] || "").trim();
      if (o !== n) {
        await addActivity(req.params.dealId, {
          type: "info_change",
          body: `${label}: ${o || "—"} → ${n || "—"}`,
          author: savedBy,
        });
      }
    }
    res.json({ ok: true, info });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/:dealId/kp/prefill", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    const prefill = await getKpPrefill(req.params.dealId, deal);
    res.json({ ok: true, prefill });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/deals/:dealId/kp/export", requireAuth(), upload.single("file"), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    if (!req.file) return res.status(400).json({ error: "Файл не передан" });
    const docType = String(req.body?.docType || "kp").trim();
    const amountWithVat = parseFloat(req.body?.amountWithVat) || 0;
    const uploadedBy = req.user.displayName || req.user.managerName || req.user.email;
    const result = await uploadKpExport(req.params.dealId, req.file, {
      docType,
      amountWithVat,
      uploadedBy,
      fileName: req.body?.fileName || req.file?.originalname || req.file?.name,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deals/:dealId/pilot-requirements", requireAuth(), async (req, res) => {
  try {
    const data = await listPilotRequirements(req.params.dealId);
    res.json({ ok: true, ...data, options: { feasibility: FEASIBILITY_OPTIONS, reqTypes: PILOT_REQ_TYPES } });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка загрузки" });
  }
});

app.put("/api/deals/:dealId/pilot-requirements", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    const updatedBy = req.user.displayName || req.user.email;
    const result = await savePilotRequirements(req.params.dealId, req.body?.rows || [], { updatedBy });
    try {
      const { syncDealToKaitenAfterRequirements } = require("./kaiten-sync");
      await syncDealToKaitenAfterRequirements(req.params.dealId, deal);
    } catch (e) {
      console.warn("kaiten after pilot requirements", req.params.dealId, e.message);
    }
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка сохранения" });
  }
});

app.get("/api/deals/:dealId/product-requirements", requireAuth(), async (req, res) => {
  try {
    const data = await listProductRequirements(req.params.dealId);
    res.json({ ok: true, ...data, options: { feasibility: FEASIBILITY_OPTIONS, reqTypes: PILOT_REQ_TYPES } });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка загрузки" });
  }
});

app.put("/api/deals/:dealId/product-requirements", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canEditDeal(req.user, deal)) return res.status(403).json({ error: "Нет прав" });
    const updatedBy = req.user.displayName || req.user.email;
    const result = await saveProductRequirements(req.params.dealId, req.body?.rows || [], { updatedBy });
    try {
      const { syncDealToKaitenAfterRequirements } = require("./kaiten-sync");
      await syncDealToKaitenAfterRequirements(req.params.dealId, deal);
    } catch (e) {
      console.warn("kaiten after product requirements", req.params.dealId, e.message);
    }
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка сохранения" });
  }
});

app.get("/api/deals/:dealId/presale", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    const presale = await getPresaleForDeal(req.params.dealId);
    res.json({ ok: true, presale, stages: PRESALE_STAGES });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка загрузки пре-сейла" });
  }
});

app.patch("/api/deals/:dealId/presale", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canEditPresaleDeal(req.user, deal)) {
      return res.status(403).json({ error: "Нет прав на редактирование пре-сейла" });
    }
    const savedBy = req.user.displayName || req.user.email;
    const presale = await patchPresaleDeal(req.params.dealId, req.body?.presale || req.body || {}, {
      savedBy,
      syncSales: req.body?.syncSales !== false,
    });
    const refreshed = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    res.json({ ok: true, presale, deal: refreshed });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Ошибка сохранения пре-сейла" });
  }
});

app.get("/api/deals/:dealId/presale/activities", requireAuth(), async (req, res) => {
  try {
    const presale = await getPresaleForDeal(req.params.dealId);
    res.json({ ok: true, items: presale?.events || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка загрузки ленты пре-сейла" });
  }
});

app.post("/api/deals/:dealId/presale/activities", requireAuth(), async (req, res) => {
  try {
    const deal = await loadPipelineState({ dealId: req.params.dealId, includeArchived: true });
    if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
    if (!canEditPresaleDeal(req.user, deal)) {
      return res.status(403).json({ error: "Нет прав на запись в ленту пре-сейла" });
    }
    const item = await addPresaleEvent(req.params.dealId, {
      body: req.body?.body || req.body?.text || "",
      type: req.body?.type || "comment",
      author: req.user.displayName || req.user.email,
      meta: req.body?.meta || {},
    });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Ошибка добавления записи" });
  }
});

app.post("/api/admin/presale/backfill", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    const result = await backfillPresaleFromDeals();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка backfill пре-сейла" });
  }
});

app.post("/api/admin/kaiten/match", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const { matchKaitenCardsToDeals } = require("./kaiten-match");
    const result = await matchKaitenCardsToDeals({
      crmWins: req.body?.crmWins !== false,
      dryRun: Boolean(req.body?.dryRun),
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка match Kaiten" });
  }
});

app.post("/api/admin/kaiten/poll", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    const { pollKaitenInbound } = require("./kaiten-inbound");
    const result = await pollKaitenInbound();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || "Ошибка poll Kaiten" });
  }
});

app.post("/api/integrations/kaiten/webhook", async (req, res) => {
  try {
    const secret = process.env.KAITEN_WEBHOOK_SECRET || "";
    if (secret) {
      const hdr = req.headers["x-kaiten-webhook-secret"] || req.headers["x-webhook-secret"] || "";
      const q = req.query?.secret || "";
      if (hdr !== secret && q !== secret) {
        return res.status(401).json({ error: "Неверный секрет webhook" });
      }
    }
    const { pollKaitenInbound } = require("./kaiten-inbound");
    const cardId = req.body?.data?.card_id || req.body?.card_id || req.body?.id;
    if (cardId) {
      const { loadPresaleMap } = require("./presale-data");
      const map = await loadPresaleMap();
      const dealId = Object.keys(map).find(k => String(map[k]?.kaitenCardId) === String(cardId));
      if (dealId) {
        const result = await pollKaitenInbound();
        return res.json({ ok: true, dealId, ...result });
      }
    }
    res.json({ ok: true, note: "Webhook received; full poll runs on timer" });
  } catch (e) {
    res.status(500).json({ error: e.message || "Webhook error" });
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
    const items = await listAllTasks({
      assignee,
      from: req.query.from,
      to: req.query.to,
      includeDone: req.query.includeDone === "1",
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/tasks/next-due", requireAuth(), async (_req, res) => {
  try {
    res.json({ items: await listNextTaskDueByDeal() });
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
    const stages = req.body?.stages || [];
    const allStages = req.body?.allStages || stages;
    const data = await saveKanbanConfig(stages, { allStages, listKey: "stages" });
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/kanban/presale-config", requireAuth(), async (_req, res) => {
  try {
    res.json(await getKanbanConfig(PRESALE_CONFIG_KEY));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/kanban/presale-config", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const stages = req.body?.stages || [];
    const allStages = req.body?.allStages || stages;
    const data = await saveKanbanConfig(stages, {
      allStages,
      configKey: PRESALE_CONFIG_KEY,
      listKey: "presale_stages",
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/kanban/partners-config", requireAuth(), async (_req, res) => {
  try {
    res.json(await getKanbanConfig(PARTNER_CONFIG_KEY));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/kanban/partners-config", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const stages = req.body?.stages || [];
    const allStages = req.body?.allStages || stages;
    const data = await saveKanbanConfig(stages, {
      allStages,
      configKey: PARTNER_CONFIG_KEY,
      listKey: "partner_stages",
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/kanban/tech-partners-config", requireAuth(), async (_req, res) => {
  try {
    res.json(await getKanbanConfig(TECH_PARTNER_CONFIG_KEY));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/kanban/tech-partners-config", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const stages = req.body?.stages || [];
    const allStages = req.body?.allStages || stages;
    const data = await saveKanbanConfig(stages, {
      allStages,
      configKey: TECH_PARTNER_CONFIG_KEY,
      listKey: "tech_partner_stages",
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/pipelines", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    res.json(await getPipelinesConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/admin/pipelines", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const data = await savePipelinesConfig(req.body?.pipelines || []);
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/amo-sync/status", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    const meta = await loadSyncMeta();
    res.json({ ok: true, ...meta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/amo-sync/poll", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const forceMissingScan = req.body?.forceMissingScan !== false;
    res.json(await pollAmoInbound({ forceMissingScan }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/amo-sync/reconcile-tasks", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const dry = req.body?.dry === true;
    const limit = Number(req.body?.limit) || 0;
    const { reconcileAmoTasks } = require("./amo-task-reconcile");
    const stats = await reconcileAmoTasks({ dry, limit });
    res.json({ ok: true, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/kanban/reset-sales-stages", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    const data = await resetSalesStagesLists();
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/deals/:dealId/amo-resync", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const dealId = req.params.dealId;
    const row = await findOne("deals", `deal_id="${String(dealId).replace(/"/g, '\\"')}"`);
    if (!row?.amo_id) return res.status(400).json({ error: "У сделки нет amo_id" });
    const token = await getAccessToken();
    const leads = await amoGetAll("/api/v4/leads", token, { "filter[id]": row.amo_id, with: "contacts" });
    const lead = leads[0];
    if (!lead) return res.status(404).json({ error: "Сделка не найдена в AmoCRM" });
    const cfg = await getPipelinesConfig();
    const pipe = (cfg.pipelines || []).find(p => p.id === "sales") || { id: "sales", syncEnabled: true };
    const result = await syncLeadFromAmo({
      lead,
      token,
      pipeline: pipe,
      stageName: "",
      crmStage: row.stage || "",
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/amo/user-map", requireAuth(), async (_req, res) => {
  try {
    const { getAmoUserIdMap } = require("./amo-users");
    const token = await getAccessToken();
    const data = await getAmoUserIdMap(token);
    res.json(data);
  } catch (e) {
    res.json({ byId: {}, unmapped: [] });
  }
});

app.get("/api/admin/amo-sync/user-audit", requireAuth(), requireAdmin, async (_req, res) => {
  try {
    const { auditAmoUserMappings } = require("./amo-users");
    const token = await getAccessToken();
    res.json(await auditAmoUserMappings(token));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/partner-refs/search", requireAuth(), async (req, res) => {
  try {
    const items = await searchPartnerRefs(req.query.q || "", Number(req.query.limit) || 40);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/entities/suggest", requireAuth(), async (req, res) => {
  try {
    const type = req.query.type === "company" ? "company" : "contact";
    const items = await suggestEntities(type, req.query.q || "", Number(req.query.limit) || 15);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
    const profile = await updateProfile(req.user.id, req.body || {}, req.user);
    res.json({ ok: true, profile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/profile/avatar", requireAuth(), upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Нет файла" });
    const profile = await uploadAvatar(req.user.id, req.file, req.user);
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

app.post("/api/profile/email", requireAuth(), async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { email, token: newToken, user } = await changeEmail(
      token,
      req.body?.password,
      req.body?.email,
    );
    res.json({ ok: true, email, token: newToken, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/users", requireAuth(), requireAdmin, async (_req, res) => {
  res.json({ items: await listUsers() });
});

app.get("/api/admin/activities", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const data = await listAdminActivities({
      from: req.query.from || "",
      to: req.query.to || "",
      user: req.query.user || "",
      section: req.query.section || "",
      subsection: req.query.subsection || "",
      field: req.query.field || "",
      dealId: req.query.dealId || "",
      source: req.query.source || "all",
      q: req.query.q || "",
      scoreImpactDir: req.query.scoreImpactDir || "",
      scoreImpactFrom: req.query.scoreImpactFrom || "",
      scoreImpactTo: req.query.scoreImpactTo || "",
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

app.get("/api/reports/requirements-summary", requireAuth(), async (req, res) => {
  try {
    const raw = String(req.query.dealIds || "").trim();
    const dealIds = raw ? raw.split("|").map(s => s.trim()).filter(Boolean) : null;
    const summary = await buildRequirementsSummary(dealIds);
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error("GET /api/reports/requirements-summary", e);
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

app.get("/api/reports/task-metrics", requireAuth(), async (req, res) => {
  try {
    const { buildTaskMetrics } = require("./task-metrics");
    const period = String(req.query.period || "month");
    const opts = {};
    if (req.query.from) opts.from = String(req.query.from);
    if (req.query.to) opts.to = String(req.query.to);
    if (req.query.owner) opts.owner = String(req.query.owner);
    res.json(await buildTaskMetrics(period, opts));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/amo-sync/fix-feed-chronology", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const { fixAmoFeedChronology } = require("./amo-lead-sync");
    res.json(await fixAmoFeedChronology({
      batchSize: Math.min(200, Number(req.body?.batchSize) || 40),
      offset: Number(req.body?.offset) || 0,
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/kaiten/fix-feed-chronology", requireAuth(), requireAdmin, async (req, res) => {
  try {
    const { fixKaitenFeedChronology } = require("./kaiten-inbound");
    res.json(await fixKaitenFeedChronology({
      batchSize: Math.min(100, Number(req.body?.batchSize) || 30),
      offset: Number(req.body?.offset) || 0,
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/dynamics", requireAuth(), async (req, res) => {
  try {
    const period = String(req.query.period || "week");
    const opts = {};
    if (req.query.from) opts.from = String(req.query.from);
    if (req.query.to) opts.to = String(req.query.to);
    if (req.query.trendPeriod) opts.trendPeriod = String(req.query.trendPeriod);
    if (req.query.trendFrom) opts.trendFrom = String(req.query.trendFrom);
    if (req.query.trendTo) opts.trendTo = String(req.query.trendTo);
    res.json(await getDynamics(period, opts));
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
