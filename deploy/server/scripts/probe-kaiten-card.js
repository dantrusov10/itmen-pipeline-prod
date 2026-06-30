#!/usr/bin/env node
"use strict";
const fs = require("fs");
const envPath = "/opt/itmen-pipeline/.env";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const { kaitenRequest } = require("../api/src/kaiten-client");
const cardId = process.argv[2] || "60791845";
(async () => {
  const card = await kaitenRequest(`/cards/${cardId}`);
  console.log("members", JSON.stringify(card.members || [], null, 2));
  console.log("description", String(card.description || "").slice(0, 200));
  try {
    const files = await kaitenRequest(`/cards/${cardId}/files`);
    console.log("files", JSON.stringify(files, null, 2).slice(0, 2000));
  } catch (e) {
    console.log("files err", e.message);
  }
  const comments = await kaitenRequest(`/cards/${cardId}/comments`);
  console.log("comments count", Array.isArray(comments) ? comments.length : comments);
  if (Array.isArray(comments) && comments[0]) console.log("comment0", JSON.stringify(comments[0], null, 2).slice(0, 500));
})().catch(e => console.error(e));
