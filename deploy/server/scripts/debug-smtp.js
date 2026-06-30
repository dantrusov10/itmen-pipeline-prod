"use strict";
const fs = require("fs");
const path = "/opt/itmen-pipeline/.env";
for (const line of fs.readFileSync(path, "utf8").split(/\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const to = process.argv[2] || "dantrusov10@yandex.ru";
require("/opt/itmen-pipeline/api/src/mailer")
  .sendEmailNotification(to, { title: "ITMen test", message: "SMTP test", link: "https://itmen-pipeline.nwlvl.ru" })
  .then(ok => { console.log(ok ? "OK" : "FAIL"); process.exit(ok ? 0 : 1); });
