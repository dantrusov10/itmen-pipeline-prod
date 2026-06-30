"use strict";

/**
 * Email-уведомления (опционально).
 * Задайте SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM в /opt/itmen-pipeline/.env
 * npm install nodemailer — при первом включении почты.
 */
async function sendEmailNotification(to, { title, message, link } = {}) {
  const email = String(to || "").trim();
  if (!email) return false;
  const host = process.env.SMTP_HOST || "";
  if (!host) return false;

  const subject = String(title || "ITMen Pipeline").trim();
  const body = [message || "", link ? `\n\n${link}` : ""].filter(Boolean).join("\n");

  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || "",
      } : undefined,
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
