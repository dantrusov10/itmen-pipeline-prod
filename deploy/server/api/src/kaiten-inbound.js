"use strict";

const { getKaitenConfig, resolvePresaleFromColumn } = require("./kaiten-config");
const { listBoardCards, listCardComments, getCard, listCardFiles, downloadFileUrl } = require("./kaiten-client");
const { isInboundBlocked } = require("./kaiten-sync");
const {
  resolveCrmOwnerFromKaitenUserId,
  resolveCrmOwnerName,
  readResponsibleUserId,
} = require("./kaiten-owners");
const {
  loadPresaleMap,
  savePresaleMap,
  normalizePresale,
  patchPresaleDeal,
  addPresaleEvent,
} = require("./presale-data");
const { loadPipelineState } = require("./mapper");

const LOSS_REQUIRES_COMMENT = new Set([
  "Провал пилота (функциональный)",
  "Провал до пилота (не функциональный)",
]);

function readPropDate(card, propId) {
  if (!propId || !card) return "";
  const props = card.properties || {};
  const val = props[`id_${propId}`] ?? props[propId] ?? card[`id_${propId}`];
  if (!val) return "";
  if (typeof val === "string") return val.slice(0, 10);
  if (val.date) return String(val.date).slice(0, 10);
  return "";
}

function cardRemoteUpdatedAt(card) {
  return String(card?.updated || card?.updated_at || card?.changed_at || "").trim();
}

function kaitenDateIso(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number") {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function commentCreatedAt(c) {
  return kaitenDateIso(c.created || c.created_at || c.updated || c.updated_at);
}

function cardCreatedAt(card) {
  return kaitenDateIso(card?.created || card?.created_at || card?.updated || card?.updated_at);
}

function buildInboundPatch(presale, card) {
  const cfg = getKaitenConfig();
  const patch = {};
  const columnId = card?.column_id ?? card?.column?.id;
  const fromColumn = resolvePresaleFromColumn(columnId, card?.title || "");
  if (fromColumn) {
    if (fromColumn.stage && fromColumn.stage !== presale.stage) patch.stage = fromColumn.stage;
    if (fromColumn.lossReason !== undefined && fromColumn.lossReason !== presale.lossReason) {
      patch.lossReason = fromColumn.lossReason;
    }
  if (fromColumn.stage === "Отказ" && fromColumn.lossReason) {
    patch.lossReason = fromColumn.lossReason;
  }
  if (patch.stage === "Отказ") {
    const reason = patch.lossReason || presale.lossReason;
    if (LOSS_REQUIRES_COMMENT.has(reason) && !String(presale.lossComment || patch.lossComment || "").trim()) {
      delete patch.stage;
      delete patch.lossReason;
    }
  }
    if (fromColumn.successWithoutPilot !== undefined
      && Boolean(fromColumn.successWithoutPilot) !== Boolean(presale.successWithoutPilot)) {
      patch.successWithoutPilot = fromColumn.successWithoutPilot;
    }
  }

  const kaitenUserId = readResponsibleUserId(card);
  const crmOwner = resolveCrmOwnerFromKaitenUserId(kaitenUserId);
  if (crmOwner !== (presale.owner || "")) patch.owner = crmOwner;
  else if (!kaitenUserId && presale.owner) patch.owner = "";

  const pilotStart = readPropDate(card, cfg.properties.pilotStart);
  const pilotEnd = readPropDate(card, cfg.properties.pilotEnd);
  const distroIssueDate = readPropDate(card, cfg.properties.distroIssueDate);
  const distroEndDate = readPropDate(card, cfg.properties.distroEndDate);

  if (pilotStart && pilotStart !== presale.pilotStart) patch.pilotStart = pilotStart;
  if (pilotEnd && pilotEnd !== presale.pilotEnd) patch.pilotEnd = pilotEnd;
  if (distroIssueDate && distroIssueDate !== presale.distroIssueDate) patch.distroIssueDate = distroIssueDate;
  if (distroEndDate && distroEndDate !== presale.distroEndDate) patch.distroEndDate = distroEndDate;

  return patch;
}

async function syncCommentsFromCard(dealId, cardId, presale) {
  const linkedId = Number(presale?.kaitenCardId || 0);
  if (linkedId && Number(cardId) !== linkedId) {
    return { added: 0, error: `card mismatch: ${cardId} != ${linkedId}` };
  }
  const known = new Set((presale.kaitenSyncedCommentIds || []).map(String));
  let comments = [];
  try {
    const raw = await listCardComments(cardId);
    comments = Array.isArray(raw) ? raw : (raw?.comments || raw?.items || []);
  } catch (e) {
    return { added: 0, error: String(e.message || e) };
  }

  const fresh = comments
    .filter(c => c?.id != null && !known.has(String(c.id)))
    .sort((a, b) => new Date(a.created || a.created_at || 0) - new Date(b.created || b.created_at || 0));

  let added = 0;
  for (const c of fresh) {
    const body = String(c.text || c.body || c.content || c.comment || "").trim();
    if (!body) {
      known.add(String(c.id));
      continue;
    }
    const authorId = c.author_id || c.author?.id;
    const author = authorId
      ? resolveCrmOwnerFromKaitenUserId(authorId)
      : String(c.author?.full_name || c.author?.name || c.author_name || "Kaiten").trim();
    await addPresaleEvent(dealId, {
      type: "kaiten_comment",
      body,
      author,
      at: commentCreatedAt(c) || undefined,
      meta: { kaitenCommentId: c.id, kaitenCardId: cardId, fromKaiten: true },
    }, { skipKaitenComment: true });
    known.add(String(c.id));
    added++;
  }

  return {
    added,
    kaitenSyncedCommentIds: [...known].slice(-500),
  };
}

async function syncDescriptionFromCard(dealId, cardId, presale, card) {
  const linkedId = Number(presale?.kaitenCardId || 0);
  if (linkedId && Number(cardId) !== linkedId) {
    return { added: false, error: `card mismatch: ${cardId} != ${linkedId}` };
  }
  if (presale.kaitenDescriptionSynced) return { added: false };
  const fullCard = card?.description != null ? card : await getCard(cardId);
  const desc = String(fullCard?.description || "").trim();
  if (!desc) {
    return { added: false, kaitenDescriptionSynced: true };
  }
  await addPresaleEvent(dealId, {
    type: "kaiten_description",
    body: `[Описание Kaiten]\n${desc}`,
    author: "Kaiten",
    at: cardCreatedAt(fullCard) || undefined,
    meta: { kaitenCardId: cardId, fromKaiten: true },
  }, { skipKaitenComment: true });
  return { added: true, kaitenDescriptionSynced: true };
}

async function syncFilesFromCard(dealId, cardId, presale) {
  const linkedId = Number(presale?.kaitenCardId || 0);
  if (linkedId && Number(cardId) !== linkedId) {
    return { added: 0, error: `card mismatch: ${cardId} != ${linkedId}`, kaitenSyncedFileIds: presale?.kaitenSyncedFileIds || [] };
  }
  const { uploadDealFileBuffer } = require("./deal-crm");
  const known = new Set((presale.kaitenSyncedFileIds || []).map(String));
  let files = [];
  try {
    const raw = await listCardFiles(cardId);
    files = Array.isArray(raw) ? raw : (raw?.files || raw?.items || []);
  } catch (e) {
    return { added: 0, error: String(e.message || e), kaitenSyncedFileIds: [...known] };
  }

  let added = 0;
  for (const f of files) {
    const fid = f?.id;
    if (fid == null || f.deleted || known.has(String(fid))) continue;
    const url = f.url || f.download_url;
    if (!url) {
      known.add(String(fid));
      continue;
    }
    try {
      const { buffer, mimeType } = await downloadFileUrl(url);
      await uploadDealFileBuffer(dealId, {
        buffer,
        originalName: f.name || `kaiten-file-${fid}`,
        mimeType: f.mime_type || mimeType,
        label: "Kaiten",
        uploadedBy: "kaiten",
      });
      known.add(String(fid));
      added++;
    } catch (e) {
      console.warn("kaiten file import", dealId, fid, e.message);
    }
  }
  return { added, kaitenSyncedFileIds: [...known].slice(-500) };
}

async function backfillCardToCrm(dealId, cardId, presale, card, { reset = false } = {}) {
  const linkedId = Number(presale?.kaitenCardId || 0);
  if (linkedId && Number(cardId) !== linkedId) {
    throw new Error(`Kaiten card ${cardId} is not linked to ${dealId} (linked: ${linkedId})`);
  }
  const base = reset
    ? { ...presale, kaitenSyncedCommentIds: [], kaitenSyncedFileIds: [], kaitenDescriptionSynced: false }
    : presale;
  const fullCard = card || await getCard(cardId);
  const commentResult = await syncCommentsFromCard(dealId, cardId, base);
  const descResult = await syncDescriptionFromCard(dealId, cardId, base, fullCard);
  const fileResult = await syncFilesFromCard(dealId, cardId, base);
  return { commentResult, descResult, fileResult };
}

async function pollKaitenInbound({ cardIndex = null } = {}) {
  const cfg = getKaitenConfig();
  if (!cfg.enabled) return { ok: false, error: "Kaiten disabled" };

  const presaleMap = await loadPresaleMap();
  const linked = Object.entries(presaleMap)
    .filter(([, p]) => p?.kaitenCardId)
    .map(([dealId, p]) => ({ dealId, presale: normalizePresale(p) }));

  if (!linked.length) {
    return { ok: true, checked: 0, updated: 0, comments: 0 };
  }

  let cardsById = cardIndex;
  if (!cardsById) {
    const raw = await listBoardCards(500);
    const cards = Array.isArray(raw) ? raw : (raw?.cards || raw?.items || []);
    cardsById = new Map(cards.map(c => [String(c.id), c]));
  }

  let updated = 0;
  let commentsAdded = 0;
  const details = [];

  for (const { dealId, presale } of linked) {
    const cardId = presale.kaitenCardId;
    const card = cardsById.get(String(cardId));
    if (!card) {
      details.push({ dealId, cardId, status: "missing" });
      continue;
    }
    if (isInboundBlocked(dealId)) {
      details.push({ dealId, cardId, status: "blocked" });
      continue;
    }

    const remoteUpdatedAt = cardRemoteUpdatedAt(card);
    const patch = buildInboundPatch(presale, card);
    const hasFieldChanges = Object.keys(patch).length > 0;
    const remoteChanged = remoteUpdatedAt && remoteUpdatedAt !== presale.kaitenRemoteUpdatedAt;

    if (hasFieldChanges) {
      if (patch.stage === "Отказ" && !patch.lossReason && !presale.lossReason) {
        details.push({ dealId, cardId, status: "skipped_refusal", columnId: card?.column_id });
      } else {
        try {
          const deal = await loadPipelineState({ dealId, includeArchived: true });
          await patchPresaleDeal(dealId, patch, {
            savedBy: "kaiten",
            syncSales: true,
            skipKaiten: true,
            deal,
          });
          updated++;
          details.push({ dealId, cardId, status: "updated", patch });
        } catch (e) {
          details.push({ dealId, cardId, status: "error", error: String(e.message || e) });
        }
      }
    }

    const commentResult = await syncCommentsFromCard(dealId, cardId, presale);
    const descResult = await syncDescriptionFromCard(dealId, cardId, presale, card);
    const fileResult = await syncFilesFromCard(dealId, cardId, presale);
    if (commentResult.added) {
      commentsAdded += commentResult.added;
      details.push({ dealId, cardId, status: "comments", added: commentResult.added });
    }
    if (descResult.added) details.push({ dealId, cardId, status: "description" });
    if (fileResult.added) details.push({ dealId, cardId, status: "files", added: fileResult.added });

    const map = await loadPresaleMap();
    const current = normalizePresale(map[dealId]);
    map[dealId] = {
      ...current,
      kaitenRemoteUpdatedAt: remoteUpdatedAt || current.kaitenRemoteUpdatedAt || "",
      kaitenSyncedCommentIds: commentResult.kaitenSyncedCommentIds || current.kaitenSyncedCommentIds || [],
      kaitenSyncedFileIds: fileResult.kaitenSyncedFileIds || current.kaitenSyncedFileIds || [],
      kaitenDescriptionSynced: descResult.kaitenDescriptionSynced ?? current.kaitenDescriptionSynced,
      kaitenSyncedAt: new Date().toISOString(),
      kaitenSyncError: commentResult.error || fileResult.error || "",
    };
    await savePresaleMap(map);

    if (!hasFieldChanges && !commentResult.added && !descResult.added && !fileResult.added && remoteChanged) {
      details.push({ dealId, cardId, status: "seen" });
    }
  }

  return {
    ok: true,
    checked: linked.length,
    updated,
    comments: commentsAdded,
    details,
  };
}

async function fixKaitenFeedChronology({ batchSize = 30, offset = 0 } = {}) {
  const cfg = getKaitenConfig();
  if (!cfg.enabled) return { ok: false, error: "Kaiten disabled" };

  const map = await loadPresaleMap();
  const linked = Object.entries(map)
    .filter(([, p]) => p?.kaitenCardId)
    .map(([dealId, p]) => ({ dealId, presale: normalizePresale(p) }))
    .sort((a, b) => a.dealId.localeCompare(b.dealId));

  let nextOffset = offset;
  const stats = { processed: 0, fixed: 0, errors: 0 };

  for (let i = 0; i < batchSize; i++) {
    const item = linked[nextOffset % linked.length];
    nextOffset += 1;
    if (!item) break;
    const { dealId, presale } = item;
    const cardId = presale.kaitenCardId;
    try {
      const raw = await listCardComments(cardId);
      const comments = Array.isArray(raw) ? raw : (raw?.comments || raw?.items || []);
      const byId = new Map(comments.map(c => [String(c.id), commentCreatedAt(c)]));
      let cardAt = "";
      try {
        const card = await getCard(cardId);
        cardAt = cardCreatedAt(card);
      } catch (_) { /* */ }

      let changed = false;
      const events = (presale.events || []).map(ev => {
        const cid = ev?.meta?.kaitenCommentId;
        if (cid != null && byId.has(String(cid))) {
          const at = byId.get(String(cid));
          if (at && ev.at !== at) {
            changed = true;
            return { ...ev, at };
          }
        }
        if (ev?.type === "kaiten_description" && cardAt && ev.at !== cardAt) {
          changed = true;
          return { ...ev, at: cardAt };
        }
        return ev;
      });

      if (changed) {
        presale.events = events.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
        map[dealId] = presale;
        await savePresaleMap(map);
        stats.fixed += 1;
      }
      stats.processed += 1;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      stats.errors += 1;
      console.warn("fixKaitenFeedChronology", dealId, e.message);
    }
  }

  return {
    ok: true,
    total: linked.length,
    nextOffset: linked.length ? nextOffset % linked.length : 0,
    ...stats,
  };
}

module.exports = {
  pollKaitenInbound,
  buildInboundPatch,
  readPropDate,
  kaitenDateIso,
  syncCommentsFromCard,
  syncDescriptionFromCard,
  syncFilesFromCard,
  backfillCardToCrm,
  fixKaitenFeedChronology,
};
