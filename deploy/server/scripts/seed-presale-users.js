#!/usr/bin/env node
"use strict";

/**
 * Создание пользователей пре-сейла (запуск на сервере с PB admin token).
 * Пример:
 *   PB_URL=http://127.0.0.1:8095 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node seed-presale-users.js
 */

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8095";
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

const USERS = [
  {
    email: "gadirov@itmen.local",
    password: process.env.PRESALE_GADIROV_PASSWORD || "Presale2026!",
    role: "presale",
    managerName: "Гадиров Гадир",
    displayName: "Гадиров Гадир",
  },
  {
    email: "lashin@itmen.local",
    password: process.env.PRESALE_LASHIN_PASSWORD || "Presale2026!",
    role: "presale",
    managerName: "Иван Лашин",
    displayName: "Иван Лашин",
  },
];

async function adminToken() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Укажите PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD");
  }
  const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Admin auth failed");
  return data.token;
}

async function upsertUser(token, user) {
  const q = encodeURIComponent(`email="${user.email}"`);
  const list = await fetch(`${PB_URL}/api/collections/pipeline_users/records?filter=${q}`, {
    headers: { Authorization: token },
  }).then(r => r.json());
  const existing = list.items?.[0];
  const body = {
    email: user.email,
    password: user.password,
    passwordConfirm: user.password,
    role: user.role,
    manager_name: user.managerName,
    display_name: user.displayName,
  };
  if (existing) {
    const res = await fetch(`${PB_URL}/api/collections/pipeline_users/records/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `PATCH ${user.email}`);
    console.log("updated", user.email);
    return data;
  }
  const res = await fetch(`${PB_URL}/api/collections/pipeline_users/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `POST ${user.email}`);
  console.log("created", user.email);
  return data;
}

async function main() {
  const token = await adminToken();
  for (const u of USERS) await upsertUser(token, u);
  console.log("Done.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
