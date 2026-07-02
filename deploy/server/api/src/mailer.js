"use strict";

const fs = require("fs");

function loadEnv() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return;
  const path = "/opt/itmen-pipeline/.env";
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [k, v] = trimmed.split("=", 2);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

/**
 * Email-уведомления (опционально).
 * Задайте SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM в /opt/itmen-pipeline/.env
 * npm install nodemailer — при первом включении почты.
 */
async function sendEmailNotification(to, { title, message, link } = {}) {
  const email = String(to || "").trim();
  if (!email) return false;

  const host = process.env.SMTP_HOST || (process.env.SMTP_USER ? "smtp.mail.selcloud.ru" : "");
  if (!host) return false;

  const port = Number(process.env.SMTP_PORT || (host.includes("selcloud") ? 1127 : 587));
  const secure = process.env.SMTP_SECURE === "1" || port === 465 || port === 1127;

  const subject = String(title || "ITMen Pipeline").trim();
  const body = [message || "", link ? `\n\n${link}` : ""].filter(Boolean).join("\n");

  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || "",
      } : undefined,
      tls: { servername: host.replace(/^\[|\]$/g, "") },
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject,
      text: body,
    });
    return true;
  } catch (e) {
    console.warn("mailer:", email, e.message);
    return false;
  }
}

module.exports = { sendEmailNotification };
