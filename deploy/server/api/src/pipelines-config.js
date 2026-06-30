"use strict";

const { findOne, createRecord, updateRecord } = require("./pb-client");

const META_SLUG = "pipelines";

const DEFAULT_PIPELINES = [
  {
    id: "sales",
    label: "Продажи",
    type: "deals",
    workspaceId: "sales",
    stagesListKey: "stages",
    kanbanConfigKey: "kanban_stages",
    syncEnabled: true,
    amoPipelineId: null,
    amoPipelineName: "ИТМЕН",
  },
  {
    id: "presale",
    label: "Пре-сейл",
    type: "deals",
    workspaceId: "presale",
    stagesListKey: "presale_stages",
    kanbanConfigKey: "presale_kanban_stages",
    syncEnabled: false,
    amoPipelineId: null,
  },
  {
    id: "partners",
    label: "Партнёры",
    type: "reference",
    referenceField: "partner",
    referenceSection: "main",
    stagesListKey: "partner_stages",
    kanbanConfigKey: "partner_kanban_stages",
    syncEnabled: true,
    amoPipelineId: null,
    amoPipelineName: "Партнёры",
  },
  {
    id: "tech_partners",
    label: "Технологические партнёры",
    type: "reference",
    referenceField: "distributor",
    referenceSection: "info",
    stagesListKey: "tech_partner_stages",
    kanbanConfigKey: "tech_partner_kanban_stages",
    syncEnabled: true,
    amoPipelineId: null,
    amoPipelineName: "Технологические партнёры",
  },
];

function parseConfig(row) {
  if (!row) return { pipelines: [...DEFAULT_PIPELINES] };
  try {
    const data = JSON.parse(row.focus_goal || "{}");
    if (Array.isArray(data.pipelines) && data.pipelines.length) {
      return { pipelines: data.pipelines };
    }
  } catch (_) { /* ignore */ }
  return { pipelines: [...DEFAULT_PIPELINES] };
}

async function getPipelinesConfig() {
  const row = await findOne("pipeline_meta", `slug="${META_SLUG}"`);
  return parseConfig(row);
}

async function savePipelinesConfig(pipelines) {
  if (!Array.isArray(pipelines)) throw new Error("Ожидается массив воронок");
  const body = {
    slug: META_SLUG,
    focus_goal: JSON.stringify({ pipelines }, null, 0),
    saved_at: new Date().toISOString(),
  };
  const existing = await findOne("pipeline_meta", `slug="${META_SLUG}"`);
  if (existing) await updateRecord("pipeline_meta", existing.id, body);
  else await createRecord("pipeline_meta", body);
  return { pipelines };
}

function getPipelineById(cfg, id) {
  return (cfg?.pipelines || []).find(p => p.id === id) || null;
}

module.exports = {
  META_SLUG,
  DEFAULT_PIPELINES,
  getPipelinesConfig,
  savePipelinesConfig,
  getPipelineById,
};
