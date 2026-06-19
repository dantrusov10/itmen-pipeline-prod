const jwt = require("jsonwebtoken");

const MANAGERS = [
  { id: "merlein", name: "Аркадий Мерлейн", sheet: "Мерлейн", role: "manager" },
  { id: "akhmetshin", name: "Арслан Ахметшин", sheet: "Ахметшин", role: "manager" },
  { id: "sirotkin", name: "Александр Сироткин", sheet: "Сироткин", role: "manager" },
  { id: "kulagin", name: "Алексей Кулагин", sheet: "Кулагин", role: "manager" },
  { id: "admin", name: "Администратор", sheet: null, role: "admin" },
];

function getJwtSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-in-production";
}

function authenticate(login, pin) {
  const user = MANAGERS.find(m => m.id === login || m.name === login);
  if (!user) return null;

  const adminPin = process.env.ADMIN_PIN || "admin123";
  const managerPin = process.env.MANAGER_PIN || "manager123";

  const ok = user.role === "admin"
    ? pin === adminPin
    : pin === managerPin || pin === adminPin;

  if (!ok) return null;

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role, sheet: user.sheet },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
  return { token, user: { id: user.id, name: user.name, role: user.role, sheet: user.sheet } };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const cookie = req.cookies?.itmen_token;
  const token = header.startsWith("Bearer ") ? header.slice(7) : cookie;

  if (!token) {
    return res.status(401).json({ error: "Требуется авторизация" });
  }
  try {
    req.user = jwt.verify(token, getJwtSecret());
    next();
  } catch {
    return res.status(401).json({ error: "Сессия истекла — войдите снова" });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const cookie = req.cookies?.itmen_token;
  const token = header.startsWith("Bearer ") ? header.slice(7) : cookie;
  if (token) {
    try { req.user = jwt.verify(token, getJwtSecret()); } catch { /* ignore */ }
  }
  next();
}

module.exports = { MANAGERS, authenticate, authMiddleware, optionalAuth };
