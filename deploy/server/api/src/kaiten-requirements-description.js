"use strict";

function escCell(s) {
  return String(s || "")
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatPilotRequirementsTable(data) {
  const rows = (data?.rows || []).filter(r =>
    String(r.clientRequirement || r.client_requirement || "").trim()
    || String(r.businessNeed || r.business_need || "").trim(),
  );
  if (!rows.length) return "";
  const pct = data?.feasibilityPct;
  const header = `### Требования к пилоту${pct != null ? ` · вероятность выполнения ${pct}%` : ""}`;
  const lines = [
    header,
    "",
    "| № | Бизнес-потребность | Требование клиента | Тип | Обязат. | Возможность | Метрика |",
    "|---|---|---|---|---|---|---|",
  ];
  rows.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${escCell(r.businessNeed || r.business_need)} | ${escCell(r.clientRequirement || r.client_requirement)} | ${escCell(r.reqType || r.req_type || "Тех")} | ${r.isMandatory === false ? "Нет" : "Да"} | ${escCell(r.feasibility || "—")} | ${escCell(r.verificationMetric || r.verification_metric)} |`);
  });
  return lines.join("\n");
}

function formatProductRequirementsTable(data) {
  const rows = (data?.rows || []).filter(r =>
    String(r.functionalRequirement || r.functional_requirement || "").trim()
    || String(r.businessRequirement || r.business_requirement || "").trim(),
  );
  if (!rows.length) return "";
  const pct = data?.feasibilityPct;
  const header = `### Требования к продукту${pct != null ? ` · вероятность выполнения ${pct}%` : ""}`;
  const lines = [
    header,
    "",
    "| № | Бизнес-требование | Функциональное требование | Тип | Обязат. | Возможность |",
    "|---|---|---|---|---|---|",
  ];
  rows.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${escCell(r.businessRequirement || r.business_requirement)} | ${escCell(r.functionalRequirement || r.functional_requirement)} | ${escCell(r.reqType || r.req_type || "Тех")} | ${r.isMandatory === false ? "Нет" : "Да"} | ${escCell(r.feasibility || "—")} |`);
  });
  return lines.join("\n");
}

function buildRequirementsDescriptionBlocks(pilotData, productData) {
  const pilot = formatPilotRequirementsTable(pilotData);
  const product = formatProductRequirementsTable(productData);
  const blocks = [pilot, product].filter(Boolean);
  return blocks.join("\n\n---\n\n");
}

module.exports = {
  buildRequirementsDescriptionBlocks,
  formatPilotRequirementsTable,
  formatProductRequirementsTable,
};
