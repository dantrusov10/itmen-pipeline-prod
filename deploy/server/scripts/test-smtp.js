"use strict";
require("/opt/itmen-pipeline/api/src/mailer").sendEmailNotification(
  process.argv[2] || "",
  {
    title: "ITMen Pipeline — тест почты",
    message: "Если вы видите это письмо, SMTP настроен корректно.",
    link: process.env.PUBLIC_URL || "https://itmen-pipeline.nwlvl.ru",
  },
).then(ok => {
  console.log(ok ? "sent" : "failed");
  process.exit(ok ? 0 : 1);
});
