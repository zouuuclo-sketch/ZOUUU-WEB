require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  siteName: "ZOUUU",
  title: "FIRST DROP",
  target: "",
  message: "ENTER YOUR EMAIL TO RECEIVE DROP INFORMATION.",
  successMessage: "YOU'RE IN.",
  closedMessage: "SORRY, GA DAPET.",
  placeholder: "YOUR EMAIL",
  buttonText: "ENTER",
  logo: "",
  logoSize: 280,
  maxEmails: 30,
  backgrounds: []
};

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { settings: clone(DEFAULTS), subscribers: [] };
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const settings = { ...DEFAULTS, ...(raw.settings || {}) };
    if (!Array.isArray(settings.backgrounds)) {
      settings.backgrounds = settings.background ? [settings.background] : [];
    }
    delete settings.background;
    settings.logoSize = clampInt(settings.logoSize, 40, 800, 280);
    settings.maxEmails = clampInt(settings.maxEmails, 1, 100000, 30);
    return { settings, subscribers: Array.isArray(raw.subscribers) ? raw.subscribers : [] };
  } catch (e) {
    console.error("data.json rusak/tidak terbaca:", e.message);
    return { settings: clone(DEFAULTS), subscribers: [] };
  }
}
function saveData() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function cleanText(v, fallback = "", max = 500) {
  return String(v ?? fallback).slice(0, max);
}
function safeFileName(ext) {
  return `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
}
function parseTargetMs(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function publicSettings() {
  const s = data.settings;
  const count = data.subscribers.length;
  const max = Math.max(1, Number(s.maxEmails) || 1);
  return {
    ...s,
    logoSize: clampInt(s.logoSize, 40, 800, 280),
    maxEmails: max,
    submittedCount: count,
    remaining: Math.max(0, max - count),
    isFull: count >= max
  };
}

let data = loadData();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/jpeg|image\/png|image\/webp)$/.test(file.mimetype);
    cb(ok ? null : new Error("Format harus JPG, PNG, atau WEBP."), ok);
  }
});

function adminOnly(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  const supplied = String(req.headers["x-admin-password"] || "");
  if (!expected) return res.status(500).json({ error: "ADMIN_PASSWORD belum diatur di .env" });
  if (!supplied || supplied !== expected) return res.status(401).json({ error: "PASSWORD SALAH." });
  next();
}

const { Resend } = require("resend");

function mailReady() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.OWNER_EMAIL
  );
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

async function notifyOwner(email) {
  if (!resend || !mailReady()) {
    console.log(`[ZOUUU] Resend belum diatur. Customer email: ${email}`);
    return;
  }

  const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM || "onboarding@resend.dev",
    to: [process.env.OWNER_EMAIL],
    replyTo: email,
    subject: "ZOUUU — New Email Submission",
    text: `Ada customer baru yang masuk ke Drop Gate ZOUUU.

Email customer:
${email}

Balas email ini / kirim instruksi preorder ke customer tersebut.`
  });

  if (error) {
    throw new Error(Resend error: ${error.message});
  }

  console.log([ZOUUU] Email notification sent: ${data?.id || "OK"});
}

app.get("/api/settings", (req, res) => res.json(publicSettings()));

app.post("/api/subscribe", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "EMAIL TIDAK VALID." });
  }

  // Drop Gate: email submission is locked until the countdown reaches zero.
  // This check is server-side so the gate cannot be bypassed by calling the API directly.
  const targetMs = parseTargetMs(data.settings.target);
  if (targetMs === null || Date.now() < targetMs) {
    return res.status(403).json({ error: "DROP BELUM DIBUKA.", code: "NOT_OPEN" });
  }

  const exists = data.subscribers.some(x => String(x.email).toLowerCase() === email);
  const max = Math.max(1, Number(data.settings.maxEmails) || 1);

  if (exists) {
    return res.json({ ok: true, duplicate: true, successMessage: data.settings.successMessage, isFull: data.subscribers.length >= max });
  }
  if (data.subscribers.length >= max) {
    return res.status(409).json({ error: "FULL", message: data.settings.closedMessage, isFull: true });
  }

  data.subscribers.unshift({ email, createdAt: new Date().toISOString() });
  saveData();

  try { await notifyOwner(email); } catch (e) { console.error("Gagal mengirim notifikasi email:", e.message); }

  res.json({
    ok: true,
    duplicate: false,
    successMessage: data.settings.successMessage,
    isFull: data.subscribers.length >= max,
    remaining: Math.max(0, max - data.subscribers.length)
  });
});

app.get("/api/admin/stats", adminOnly, (req, res) => {
  res.json({ count: data.subscribers.length, maxEmails: data.settings.maxEmails, remaining: Math.max(0, data.settings.maxEmails - data.subscribers.length), isFull: data.subscribers.length >= data.settings.maxEmails });
});
app.get("/api/admin/subscribers", adminOnly, (req, res) => res.json(data.subscribers));
app.post("/api/admin/settings", adminOnly, (req, res) => {
  const b = req.body || {};
  data.settings = {
    ...data.settings,
    siteName: cleanText(b.siteName, DEFAULTS.siteName, 80),
    title: cleanText(b.title, DEFAULTS.title, 160),
    target: cleanText(b.target, "", 80),
    message: cleanText(b.message, DEFAULTS.message, 500),
    successMessage: cleanText(b.successMessage, DEFAULTS.successMessage, 200),
    closedMessage: cleanText(b.closedMessage, DEFAULTS.closedMessage, 200),
    placeholder: cleanText(b.placeholder, DEFAULTS.placeholder, 100),
    buttonText: cleanText(b.buttonText, DEFAULTS.buttonText, 60),
    logo: cleanText(b.logo, "", 500),
    logoSize: clampInt(b.logoSize, 40, 800, 280),
    maxEmails: clampInt(b.maxEmails, 1, 100000, 30),
    backgrounds: Array.isArray(b.backgrounds) ? b.backgrounds.map(x => cleanText(x, "", 500)).filter(Boolean).slice(0, 100) : data.settings.backgrounds
  };
  saveData();
  res.json({ ok: true, settings: publicSettings() });
});

function removeUploadedUrl(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  const filename = path.basename(url);
  const full = path.join(UPLOAD_DIR, filename);
  if (full.startsWith(UPLOAD_DIR) && fs.existsSync(full)) { try { fs.unlinkSync(full); } catch {} }
}

app.post("/api/admin/logo", adminOnly, upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "FILE LOGO TIDAK DITEMUKAN." });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(400).json({ error: "FORMAT LOGO HARUS JPG, PNG, ATAU WEBP." }); }
  const filename = safeFileName(ext);
  const dest = path.join(UPLOAD_DIR, filename);
  fs.renameSync(req.file.path, dest);
  removeUploadedUrl(data.settings.logo);
  data.settings.logo = "/uploads/" + filename;
  saveData();
  res.json({ ok: true, logo: data.settings.logo });
});

app.post("/api/admin/backgrounds", adminOnly, upload.array("backgrounds", 50), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "PILIH MINIMAL 1 BACKGROUND." });
  const added = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) { try { fs.unlinkSync(file.path); } catch {} continue; }
    const filename = safeFileName(ext);
    fs.renameSync(file.path, path.join(UPLOAD_DIR, filename));
    added.push("/uploads/" + filename);
  }
  data.settings.backgrounds = [...data.settings.backgrounds, ...added].slice(0, 100);
  saveData();
  res.json({ ok: true, added, backgrounds: data.settings.backgrounds });
});

app.post("/api/admin/backgrounds/delete", adminOnly, (req, res) => {
  const url = cleanText(req.body?.url, "", 500);
  data.settings.backgrounds = data.settings.backgrounds.filter(x => x !== url);
  removeUploadedUrl(url);
  saveData();
  res.json({ ok: true, backgrounds: data.settings.backgrounds });
});

app.post("/api/admin/logo/delete", adminOnly, (req, res) => {
  removeUploadedUrl(data.settings.logo);
  data.settings.logo = "";
  saveData();
  res.json({ ok: true });
});

app.get("/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `UPLOAD ERROR: ${err.message}` });
  if (err) return res.status(400).json({ error: err.message || "REQUEST ERROR" });
  next();
});

app.listen(PORT, "0.0.0.0", () => console.log(`ZOUUU Drop Gate v8 running on port ${PORT}`));
